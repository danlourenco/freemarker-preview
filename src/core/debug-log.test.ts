import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { render } from './render.ts'
import { debugLog, rotateIfNeeded, MAX_LOG_BYTES, computeDebugLogPath } from './debug-log.ts'

let scratch: string
let logPath: string
const ENV_VAR = 'FREEMARKER_PREVIEW_DEBUG_LOG'

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'fmp-log-'))
  logPath = join(scratch, 'debug.log')
  process.env[ENV_VAR] = logPath
})

afterEach(() => {
  delete process.env[ENV_VAR]
  rmSync(scratch, { recursive: true, force: true })
})

describe('debug log', () => {
  test('debugLog creates the file and appends entries', () => {
    debugLog('first')
    debugLog('second')

    const content = readFileSync(logPath, 'utf8')
    expect(content).toContain('first')
    expect(content).toContain('second')
  })

  test('a render failure logs the Java stack trace to the debug log', async () => {
    const templatePath = resolve('fixtures/errors/undefined-variable.ftlh')
    const fixturePath = resolve('fixtures/errors/undefined-variable.json')

    await expect(render(templatePath, fixturePath)).rejects.toThrow()

    const content = readFileSync(logPath, 'utf8')
    expect(content).toMatch(/freemarker\./)
    expect(content).toContain('Render')
  })

  test('fixture data does not appear in the debug log when a render fails', async () => {
    const templatePath = resolve('fixtures/errors/undefined-variable.ftlh')
    const fixturePath = resolve('fixtures/errors/undefined-variable.json')

    const fixtureContent = readFileSync(fixturePath, 'utf8')
    expect(fixtureContent).toContain('"World"')

    await expect(render(templatePath, fixturePath)).rejects.toThrow()

    const content = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
    expect(content).not.toContain('"World"')
    expect(content).not.toContain('"name": "World"')
  })

  describe('computeDebugLogPath (cross-platform resolution)', () => {
    test('Windows: uses %LOCALAPPDATA% and backslashes', () => {
      const got = computeDebugLogPath({
        platform: 'win32',
        homedir: 'C:\\Users\\jane',
        env: { LOCALAPPDATA: 'C:\\Users\\jane\\AppData\\Local' },
      })
      expect(got).toBe(
        'C:\\Users\\jane\\AppData\\Local\\freemarker-preview\\debug.log',
      )
    })

    test('Windows without LOCALAPPDATA: falls through to ~/.cache (degraded)', () => {
      const got = computeDebugLogPath({
        platform: 'win32',
        homedir: 'C:\\Users\\jane',
        env: {},
      })
      expect(got).toBe('C:\\Users\\jane\\.cache\\freemarker-preview\\debug.log')
    })

    test('macOS: ~/.cache/freemarker-preview/debug.log', () => {
      const got = computeDebugLogPath({
        platform: 'darwin',
        homedir: '/Users/jane',
        env: {},
      })
      expect(got).toBe('/Users/jane/.cache/freemarker-preview/debug.log')
    })

    test('Linux with XDG_CACHE_HOME: respects it', () => {
      const got = computeDebugLogPath({
        platform: 'linux',
        homedir: '/home/jane',
        env: { XDG_CACHE_HOME: '/var/cache/jane' },
      })
      expect(got).toBe('/var/cache/jane/freemarker-preview/debug.log')
    })

    test('FREEMARKER_PREVIEW_DEBUG_LOG override always wins', () => {
      const got = computeDebugLogPath({
        platform: 'darwin',
        homedir: '/Users/jane',
        env: { FREEMARKER_PREVIEW_DEBUG_LOG: '/tmp/x.log' },
      })
      expect(got).toBe('/tmp/x.log')
    })
  })

  test('rotateIfNeeded rolls over at MAX_LOG_BYTES and keeps last 3 archives', () => {
    writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1))
    rotateIfNeeded(logPath)

    expect(existsSync(`${logPath}.1`)).toBe(true)
    expect(existsSync(logPath)).toBe(false)

    writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1))
    rotateIfNeeded(logPath)
    expect(existsSync(`${logPath}.2`)).toBe(true)

    writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1))
    rotateIfNeeded(logPath)
    expect(existsSync(`${logPath}.3`)).toBe(true)

    writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1))
    rotateIfNeeded(logPath)
    expect(existsSync(`${logPath}.3`)).toBe(true)
    expect(existsSync(`${logPath}.4`)).toBe(false)
  })
})
