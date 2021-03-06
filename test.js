/* globals test, afterEach, jest, expect */
const { createServer } = require('http')
const setup = require('./index')

const { ResponseError } = setup
const retryFetch = setup(require('node-fetch'))

let server
afterEach(() => {
  if (server) {
    server.close()
  }
  server = null
})

test('retries upon 500', async () => {
  let i = 0
  server = createServer((req, res) => {
    if (i++ < 2) {
      res.writeHead(500)
      res.end()
    } else {
      res.end('ha')
    }
  })

  return new Promise((resolve, reject) => {
    server.listen(async () => {
      try {
        const { port } = server.address()
        const res = await retryFetch(`http://127.0.0.1:${port}`)
        expect(await res.text()).toBe('ha')
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
})

test('resolves on >MAX_RETRIES', async () => {
  server = createServer((req, res) => {
    res.writeHead(500)
    res.end()
  })

  return new Promise((resolve, reject) => {
    server.listen(async () => {
      try {
        const { port } = server.address()
        const res = await retryFetch(`http://127.0.0.1:${port}`, {
          retry: {
            retries: 3
          }
        })
        expect(res.status).toBe(500)
        return resolve()
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
})

test('accepts a custom onRetry option', async () => {
  server = createServer((req, res) => {
    res.writeHead(500)
    res.end()
  })

  return new Promise((resolve, reject) => {
    const opts = {
      onRetry: jest.fn(),
      retry: {
        retries: 3
      }
    }

    server.listen(async () => {
      const { port } = server.address()
      const res = await retryFetch(`http://127.0.0.1:${port}`, opts)
      expect(opts.onRetry).toHaveBeenCalledTimes(3)
      expect(opts.onRetry.mock.calls[0][0]).toBeInstanceOf(ResponseError)
      expect(opts.onRetry.mock.calls[0][1]).toEqual(opts)
      expect(await res.status).toBe(500)
      resolve()
    })
    server.on('error', reject)
  })
})

test('accepts a custom retry.onRetry option', () => {
  server = createServer((req, res) => {
    res.writeHead(500)
    res.end()
  })

  return new Promise((resolve, reject) => {
    const opts = {
      onRetry: jest.fn(),
      retry: {
        retries: 2,
        onRetry: jest.fn()
      }
    }

    server.listen(async () => {
      try {
        const { port } = server.address()

        const res = await retryFetch(`http://127.0.0.1:${port}`, opts)
        expect(opts.onRetry).toHaveBeenCalledTimes(2)
        expect(opts.onRetry.mock.calls[0][0]).toBeInstanceOf(ResponseError)
        expect(opts.onRetry.mock.calls[0][1]).toEqual(opts)
        expect(opts.retry.onRetry).toHaveBeenCalledTimes(2)
        expect(opts.retry.onRetry.mock.calls[0][0]).toBeInstanceOf(ResponseError)
        expect(await res.status).toBe(500)
        resolve()
      } catch (e) {
        reject(e)
      }
    })
    server.on('error', reject)
  })
})

test('handles the Retry-After header', async () => {
  server = createServer((req, res) => {
    res.writeHead(429, { 'Retry-After': 1 })
    res.end()
  })

  return new Promise((resolve, reject) => {
    server.listen(async () => {
      const { port } = server.address()
      try {
        const startedAt = Date.now()
        const res = await retryFetch(`http://127.0.0.1:${port}`, {
          retry: {
            minTimeout: 10,
            retries: 1
          }
        })
        expect(res.status).toBe(429)
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1010)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
})

test('stops retrying when the Retry-After header exceeds the maxRetryAfter option', async () => {
  server = createServer((req, res) => {
    res.writeHead(429, { 'Retry-After': 21 })
    res.end()
  })

  return new Promise((resolve, reject) => {
    const opts = {
      onRetry: jest.fn()
    }

    server.listen(async () => {
      const { port } = server.address()
      try {
        const res = await retryFetch(`http://127.0.0.1:${port}`, opts)
        expect(opts.onRetry.mock.calls.length).toBe(0)
        expect(res.status).toBe(429)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
})

test('throws non ResponseError', async () => {
  let err
  const port = 84934
  const opts = {
    retry: {
      retries: 1,
      factor: 1,
      maxTimeout: 20
    }
  }
  try {
    await retryFetch(`http://127.0.0.1:${port}`, opts)
  } catch (e) {
    err = e
  }

  expect(err.code).toBe('ERR_SOCKET_BAD_PORT')
})
