import {isSpider} from '@/utils/util';

/**
 *
 *
 * @export
 * @class NuxtFetchPipeline
 */
export default class NuxtFetchPipeline {
  constructor (
    {pipelines = {}, stages = {}} = {
      pipelines: {},
      stages: {},
    }
  ) {
    this.pipelines = pipelines;
    this.stages = stages;
  }

  /**
   *
   * @param {*} context
   * @param {*} stage
   * @returns
   * @memberof NuxtFetchPipeline
   */
  runStageJobs (context, stage) {
    const stageConfig = (this.stages && this.stages[stage]) || {};
    const jobs = stageConfig.jobs;

    if (!jobs) return Promise.resolve;

    switch (stageConfig.type) {
      case 'parallel':
        return Promise.all (
          jobs.map (jobName => this.runJob (jobName, context))
        );
      case 'serial':
        return jobs.reduce ((promise, jobName) => {
          return promise.then (() => this.runJob (jobName, context));
        }, Promise.resolve ());
    }
  }

  /**
   *
   *
   * @param {*} jobName
   * @param {*} context
   * @returns
   * @memberof NuxtFetchPipeline
   */
  async runJob (jobName, context) {
    if (typeof jobName === 'string') {
      return this.pipelines[jobName].task (context);
    } else if (typeof jobName === 'object' && jobName.jobType === 'stage') {
      return this.runStageJobs (context, jobName.name);
    }
  }

  /**
   *
   *
   * @returns
   * @memberof NuxtFetchPipeline
   */
  createClientContext () {
    const app = window.$nuxt;
    const store = this.$store;
    const route = this.$route;
    const router = this.$router;
    const params = this.$route.params;
    const query = this.$route.query;
    const error = window.$nuxt.error;
    const next = location => app.router.push (location);
    const redirect = (status, path, query) => {
      if (!status) {
        return;
      }

      // if only 1 or 2 arguments: redirect('/') or redirect('/', { foo: 'bar' })
      let pathType = typeof path;
      if (
        typeof status !== 'number' &&
        (pathType === 'undefined' || pathType === 'object')
      ) {
        query = path || {};
        path = status;
        pathType = typeof path;
        status = 302;
      }
      if (pathType === 'object') {
        path = router.resolve (path).route.fullPath;
      }
      // "/absolute/route", "./relative/route" or "../relative/route"
      if (/(^[.]{1,2}\/)|(^\/(?!\/))/.test (path)) {
        next ({
          path,
          query,
          status,
        });
      } else {
        path = formatUrl (path, query);

        if (process.client) {
          // https://developer.mozilla.org/en-US/docs/Web/API/Location/replace
          window.location.replace (path);

          // Throw a redirect error
          throw new Error ('ERR_REDIRECT');
        }
      }
    };

    return {
      app,
      store,
      router,
      route,
      params,
      query,
      error,
      redirect,
    };
  }
}

/**
 *
 *
 * @export
 * @param {*} pipelineInstance
 * @returns
 */
export function pipelineMixin (pipelineInstance) {
  return {
    mounted () {
      const context = pipelineInstance.createClientContext.call (this);
      pipelineInstance.runStageJobs (context, 'mounted');

      requestIdleCallback (() => {
        pipelineInstance.runStageJobs (context, 'idle');
      });
    },
  };
}

/**
 *
 *
 * @export
 * @param {*} pipelineInstance
 * @param {*} context
 * @returns
 */
export async function adaptiveFetch (pipelineInstance, context) {
  if (isSearchEngine (context)) {
    return pipelineInstance.runStageJobs (context, 'seoFetch');
  } else {
    return pipelineInstance.runStageJobs (context, 'minFetch');
  }
}

/**
 *
 *
 * @param {*} context
 * @returns
 */
function isSearchEngine (context) {
  return isSpider (context.store.state.ua);
}

/**
 * Format given url, append query to url query string
 *
 * @param  {string} url
 * @param  {string} query
 * @return {string}
 */
function formatUrl (url, query) {
  let protocol;
  const index = url.indexOf ('://');
  if (index !== -1) {
    protocol = url.substring (0, index);
    url = url.substring (index + 3);
  } else if (url.startsWith ('//')) {
    url = url.substring (2);
  }

  let parts = url.split ('/');
  let result = (protocol ? protocol + '://' : '//') + parts.shift ();

  let path = parts.filter (Boolean).join ('/');
  let hash;
  parts = path.split ('#');
  if (parts.length === 2) {
    [path, hash] = parts;
  }

  result += path ? '/' + path : '';

  if (query && JSON.stringify (query) !== '{}') {
    result += (url.split ('?').length === 2 ? '&' : '?') + formatQuery (query);
  }
  result += hash ? '#' + hash : '';

  return result;
}

/**
 * Transform data object to query string
 *
 * @param  {object} query
 * @return {string}
 */
function formatQuery (query) {
  return Object.keys (query)
    .sort ()
    .map (key => {
      const val = query[key];
      if (val == null) {
        return '';
      }
      if (Array.isArray (val)) {
        return val.slice ().map (val2 => [key, '=', val2].join ('')).join ('&');
      }
      return key + '=' + val;
    })
    .filter (Boolean)
    .join ('&');
}

function requestIdleCallback () {
  return (window.requestIdleCallback ||
    function (cb) {
      var start = Date.now ();
      return setTimeout (function () {
        cb ({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max (0, 50 - (Date.now () - start));
          },
        });
      }, 1);
    })
    .apply (window, arguments);
}
