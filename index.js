const retry = require('async-retry')
const debug = require('debug')('fetch-retry')

// retry settings
const MIN_TIMEOUT = 10
const MAX_RETRIES = 5
const MAX_RETRY_AFTER = 20
const FACTOR = 6

module.exports = exports = setup

const wait = retryAfter =>
  // eslint-disable-next-line promise/param-names
  new Promise(r => setTimeout(r, retryAfter * 1e3))

function setup (fetch) {
  async function fetchRetry (url, opts = {}) {
    const retryOpts = Object.assign({
      // timeouts will be [10, 60, 360, 2160, 12960]
      // (before randomization is added)
      minTimeout: MIN_TIMEOUT,
      retries: MAX_RETRIES,
      factor: FACTOR,
      maxRetryAfter: MAX_RETRY_AFTER
    }, opts.retry)

    if (opts.onRetry) {
      retryOpts.onRetry = error => {
        opts.onRetry(error, opts)
        if (opts.retry && opts.retry.onRetry) {
          opts.retry.onRetry(error)
        }
      }
    }

    try {
      return await retry(async (bail, attempt) => {
        const { method = 'GET' } = opts
        try {
          // this will be retried
          const res = await fetch(url, opts)
          debug('status %d', res.status)
          if ((res.status >= 500 && res.status < 600) || res.status === 429) {
            // NOTE: doesn't support http-date format
            const retryAfter = parseInt(res.headers.get('retry-after'), 10)
            if (retryAfter) {
              if (retryAfter > retryOpts.maxRetryAfter) {
                return res
              } else {
                await wait(retryAfter)
              }
            }
            throw new ResponseError(res)
          } else {
            return res
          }
        } catch (err) {
          const isRetry = attempt <= retryOpts.retries
          debug(`${method} ${url} error (${err.status}). ${isRetry ? 'retrying' : ''}`, err)
          throw err
        }
      }, retryOpts)
    } catch (err) {
      if (err instanceof ResponseError) {
        return err.res
      }
      throw err
    }
  }

  for (const key of Object.keys(fetch)) {
    fetchRetry[key] = fetch[key]
  }
  fetchRetry.default = fetchRetry

  return fetchRetry
}

class ResponseError extends Error {
  constructor (res) {
    super(res.statusText)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ResponseError)
    }

    this.name = this.constructor.name
    this.res = res

    // backward compat
    this.code = this.status = this.statusCode = res.status
    this.url = res.url
  }
}

exports.ResponseError = ResponseError
