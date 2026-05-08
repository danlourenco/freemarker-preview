import { describe, test, expect, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { RenderDaemon } from './daemon.ts'

let daemon: RenderDaemon | undefined

afterEach(async () => {
  await daemon?.shutdown()
  daemon = undefined
})

const fixturesRoot = resolve('fixtures')

describe('RenderDaemon', () => {
  test('roundtrips a single render request and returns html', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    const { html } = await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })

    expect(html).toContain('Hello, World!')
  })

  test('handles 100 sequential renders without leaking or hanging', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    for (let i = 0; i < 100; i++) {
      const { html } = await daemon.render({
        templateName: 'hello.ftlh',
        fixturePath: resolve('fixtures/hello.json'),
      })
      expect(html).toContain('Hello, World!')
    }
  }, 60_000)

  test('per-render errors arrive as FreemarkerError envelopes (stderr stays empty)', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await expect(
      daemon.render({
        templateName: 'errors/undefined-variable.ftlh',
        fixturePath: resolve('fixtures/errors/undefined-variable.json'),
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'undefined-variable',
    })

    const { html } = await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })
    expect(html).toContain('Hello, World!')
  })

  test('an external kill triggers a silent respawn and the next render succeeds', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })

    const pid1 = daemon.pid!
    expect(pid1).toBeTypeOf('number')

    const closed = daemon.waitForClose()
    process.kill(pid1, 'SIGKILL')
    await closed

    const { html } = await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })
    expect(html).toContain('Hello, World!')

    const pid2 = daemon.pid!
    expect(pid2).not.toBe(pid1)
  })

  test('two consecutive crashes surface a daemon-crash error', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })

    let closed = daemon.waitForClose()
    process.kill(daemon.pid!, 'SIGKILL')
    await closed

    await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })

    closed = daemon.waitForClose()
    process.kill(daemon.pid!, 'SIGKILL')
    await closed

    await expect(
      daemon.render({
        templateName: 'hello.ftlh',
        fixturePath: resolve('fixtures/hello.json'),
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'daemon-crash',
    })
  })

  test('shutdown() ends the underlying process and rejects subsequent renders', async () => {
    daemon = new RenderDaemon({ templatesRoot: fixturesRoot })

    await daemon.render({
      templateName: 'hello.ftlh',
      fixturePath: resolve('fixtures/hello.json'),
    })

    const pid = daemon.pid!
    await daemon.shutdown()

    expect(daemon.pid).toBeUndefined()
    await new Promise((r) => setTimeout(r, 50))
    expect(() => process.kill(pid, 0)).toThrow()

    await expect(
      daemon.render({
        templateName: 'hello.ftlh',
        fixturePath: resolve('fixtures/hello.json'),
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'daemon-crash',
    })
  })
})
