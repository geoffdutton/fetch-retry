/* globals test, jest, expect */

const { createServer } = require('http')
const retryFetch = require('./index')(require('node-fetch'))

test('retries upon 500', async () => {
  let i = 0
  const server = createServer((req, res) => {
    if (i++ < 2) {
      res.writeHead(500)
      res.end()
    } else {
      res.end('ha')
    }
  })

  return new Promise((resolve, reject) => {
    server.listen(async () => {
      const { port } = server.address()
      try {
        const res = await retryFetch(`http://127.0.0.1:${port}`)
        expect(await res.text()).toBe('ha')
        server.close()
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    server.on('error', reject)
  })
})

test('fails on >MAX_RETRIES', async () => {
  const server = createServer((req, res) => {
    res.writeHead(500)
    res.end()
  })

  return new Promise((resolve, reject) => {
    server.listen(async () => {
      const { port } = server.address()
      try {
        await retryFetch(`http://127.0.0.1:${port}`)
      } catch (err) {
        expect(await err.status).toBe(500)
        server.close()
        return resolve()
      }
      reject(new Error('must fail'))
    })
    server.on('error', reject)
  })
})

test('accepts a custom onRetry option', async () => {
  const server = createServer((req, res) => {
    res.writeHead(500)
    res.end()
  })

  return new Promise((resolve, reject) => {
    const opts = {
      onRetry: jest.fn()
    }

    server.listen(async () => {
      const { port } = server.address()
      try {
        await retryFetch(`http://127.0.0.1:${port}`, opts)
      } catch (err) {
        expect(opts.onRetry.mock.calls.length).toBe(3)
        expect(opts.onRetry.mock.calls[0][0]).toEqual(err)
        expect(opts.onRetry.mock.calls[0][1]).toEqual(opts)
        expect(await err.status).toBe(500)
        server.close()
        return resolve()
      }
      reject(new Error('must fail'))
    })
    server.on('error', reject)
  })
})
