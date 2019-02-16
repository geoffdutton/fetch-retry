const retry = require('async-retry')
const debug = console.debug.bind(console, 'fetch-retry')

// retry settings
const MIN_TIMEOUT = 10
const MAX_RETRIES = 3
const FACTOR = 5

module.exports = setup

function setup (fetch) {
  fetch = fetch || window.fetch

  function fetchRetry (url, opts = {}) {
    const retryOpts = Object.assign({
      // timeouts will be [ 10, 50, 250 ]
      minTimeout: MIN_TIMEOUT,
      retries: MAX_RETRIES,
      factor: FACTOR
    }, opts.retry)

    if (opts.onRetry) {
      retryOpts.onRetry = error => {
        opts.onRetry(error, opts)
        if (opts.retry && opts.retry.onRetry) {
          opts.retry.onRetry(error)
        }
      }
    }

    return retry((bail, attempt) => {
      const { method = 'GET' } = opts
      return fetch(url, opts)
        .then(res => {
          if (res.status >= 500 && res.status < 600) {
            const err = new Error(res.statusText)
            err.code = err.status = err.statusCode = res.status
            err.url = url
            throw err
          } else {
            return res
          }
        })
        .catch(err => {
          debug(`${method} ${url} error (${err.status}). ${attempt < MAX_RETRIES ? 'retrying' : ''}`, err)
          throw err
        })
    }, retryOpts)
  }

  for (const key of Object.keys(fetch)) {
    fetchRetry[key] = fetch[key]
  }
  fetchRetry.default = fetchRetry

  return fetchRetry
}
