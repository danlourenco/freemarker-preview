import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from './config.ts'

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'fmp-config-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('loadConfig', () => {
  test('discovers .freemarkerrc.json by walking up from cwd', () => {
    writeFileSync(
      join(scratch, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'src/main/resources/templates' }),
    )
    const nested = join(scratch, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })

    const cfg = loadConfig(nested)

    expect(cfg.templatesRoot).toBe('src/main/resources/templates')
    expect(cfg.configPath).toBe(join(scratch, '.freemarkerrc.json'))
  })

  test('merges user values with defaults (omitted keys keep defaults)', () => {
    writeFileSync(
      join(scratch, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'templates' }),
    )

    const cfg = loadConfig(scratch)

    expect(cfg.templatesRoot).toBe('templates')
    expect(cfg.locale).toBe('en_US')
    expect(cfg.inlineCss).toBe(true)
    expect(cfg.fixturesRoot).toBeNull()
  })

  test('throws a clear error when the config file is malformed JSON', () => {
    const configPath = join(scratch, '.freemarkerrc.json')
    writeFileSync(configPath, '{ this is not valid json')

    expect(() => loadConfig(scratch)).toThrowError(
      new RegExp(`config error in ${configPath.replace(/\\/g, '\\\\')}`),
    )
  })

  test('returns defaults when no config file is found anywhere on the path', () => {
    const nested = join(scratch, 'deep', 'nested')
    mkdirSync(nested, { recursive: true })

    const cfg = loadConfig(nested)

    expect(cfg.configPath).toBeNull()
    expect(cfg.locale).toBe('en_US')
    expect(cfg.inlineCss).toBe(true)
    expect(cfg.templatesRoot).toBeNull()
  })
})
