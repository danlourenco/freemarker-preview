import { describe, test, expect, afterEach } from 'vitest'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createTcpServer, type Server as TcpServer } from 'node:net'
import { listenWithPortWalk } from './index.ts'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanup.length) {
    try { await cleanup.pop()!() } catch { /* ignore */ }
  }
})

function pickRandomPort(): number {
  return 40000 + Math.floor(Math.random() * 5000)
}

async function squatOn(host: '127.0.0.1' | '::1', port: number): Promise<TcpServer> {
  return new Promise((resolveP, rejectP) => {
    const srv = createTcpServer((sock) => sock.end())
    srv.once('error', rejectP)
    srv.listen(port, host, () => {
      srv.removeListener('error', rejectP)
      resolveP(srv)
    })
  })
}

function closeServer(srv: { close: (cb?: () => void) => void }): Promise<void> {
  return new Promise((res) => srv.close(() => res()))
}

describe('listenWithPortWalk', () => {
  test('binds the preferred port when nothing is listening', async () => {
    const port = pickRandomPort()
    const srv = createHttpServer()
    cleanup.push(() => closeServer(srv))

    const got = await listenWithPortWalk(srv, port, 5, 100)

    expect(got).toBe(port)
  })

  test('walks past an IPv6-only squatter (cross-family probe)', async () => {
    const port = pickRandomPort()
    const squatter = await squatOn('::1', port)
    cleanup.push(() => closeServer(squatter))

    const srv = createHttpServer()
    cleanup.push(() => closeServer(srv))

    const got = await listenWithPortWalk(srv, port, 5, 200)

    expect(got).toBeGreaterThan(port)
  })

  test('walks past an IPv4 squatter (same-family EADDRINUSE)', async () => {
    const port = pickRandomPort()
    const squatter = await squatOn('127.0.0.1', port)
    cleanup.push(() => closeServer(squatter))

    const srv = createHttpServer()
    cleanup.push(() => closeServer(srv))

    const got = await listenWithPortWalk(srv, port, 5, 200)

    expect(got).toBeGreaterThan(port)
  })

  test('throws a clear error when every candidate is taken', async () => {
    const port = pickRandomPort()
    const squatters: TcpServer[] = []
    for (let i = 0; i <= 5; i++) {
      const s = await squatOn('::1', port + i)
      squatters.push(s)
      cleanup.push(() => closeServer(s))
    }

    const srv = createHttpServer()
    cleanup.push(() => closeServer(srv))

    await expect(listenWithPortWalk(srv, port, 5, 100)).rejects.toThrowError(
      new RegExp(`ports ${port}\\.\\.${port + 5} are all busy`),
    )
  })
})
