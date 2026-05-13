import { describe, test, expect, vi } from 'vitest'
import { DaemonPool, type RenderDaemonLike } from './daemon-pool.ts'

function fakeDaemon(): RenderDaemonLike & { shutdown: ReturnType<typeof vi.fn> } {
  return {
    render: vi.fn(async () => ({ html: '<p>ok</p>' })),
    shutdown: vi.fn(async () => {}),
  }
}

describe('DaemonPool', () => {
  test('acquire returns a handle exposing the daemon', () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)

    const handle = pool.acquire()

    expect(handle.daemon).toBe(daemon)
    expect(typeof handle.release).toBe('function')
  })

  test('two acquires + one release: daemon stays alive (shutdown not called)', () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)

    const a = pool.acquire()
    pool.acquire()
    a.release()

    expect(daemon.shutdown).not.toHaveBeenCalled()
  })

  test('two acquires + two releases: daemon shuts down', async () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)

    const a = pool.acquire()
    const b = pool.acquire()
    a.release()
    b.release()
    await Promise.resolve()

    expect(daemon.shutdown).toHaveBeenCalledTimes(1)
  })

  test('shutdown() shuts down regardless of refcount', async () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)

    pool.acquire()
    pool.acquire()
    await pool.shutdown()

    expect(daemon.shutdown).toHaveBeenCalledTimes(1)
  })

  test('acquire after shutdown spawns a fresh daemon', async () => {
    const first = fakeDaemon()
    const second = fakeDaemon()
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, factory)

    const a = pool.acquire()
    expect(a.daemon).toBe(first)
    a.release()
    await Promise.resolve()

    const b = pool.acquire()
    expect(b.daemon).toBe(second)
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
