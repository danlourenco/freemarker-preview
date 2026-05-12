import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from './config.ts'

let scratch: string
let registryPath: string

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fmp-config-')))
  // Isolate from the user's real registry by pointing every test at a
  // non-existent registry path inside scratch.
  registryPath = join(scratch, 'no-registry.json')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('loadConfig — .freemarkerrc.json fallback', () => {
  test('discovers .freemarkerrc.json by walking up from cwd', () => {
    writeFileSync(
      join(scratch, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'src/main/resources/templates' }),
    )
    const nested = join(scratch, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })

    const cfg = loadConfig(nested, { registryPath })

    expect(cfg.templatesRoot).toBe('src/main/resources/templates')
    expect(cfg.configPath).toBe(join(scratch, '.freemarkerrc.json'))
    expect(cfg.projectRoot).toBe(scratch)
  })

  test('merges user values with defaults (omitted keys keep defaults)', () => {
    writeFileSync(
      join(scratch, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'templates' }),
    )

    const cfg = loadConfig(scratch, { registryPath })

    expect(cfg.templatesRoot).toBe('templates')
    expect(cfg.locale).toBe('en_US')
    expect(cfg.inlineCss).toBe(true)
    expect(cfg.fixture).toBeNull()
  })

  test('throws a clear error when the config file is malformed JSON', () => {
    const configPath = join(scratch, '.freemarkerrc.json')
    writeFileSync(configPath, '{ this is not valid json')

    expect(() => loadConfig(scratch, { registryPath })).toThrowError(
      new RegExp(`config error in ${configPath.replace(/\\/g, '\\\\')}`),
    )
  })

  test('returns defaults when no config or registry entry exists', () => {
    const nested = join(scratch, 'deep', 'nested')
    mkdirSync(nested, { recursive: true })

    const cfg = loadConfig(nested, { registryPath })

    expect(cfg.configPath).toBeNull()
    expect(cfg.locale).toBe('en_US')
    expect(cfg.inlineCss).toBe(true)
    expect(cfg.templatesRoot).toBeNull()
    expect(cfg.projectRoot).toBe(nested)
  })
})

describe('loadConfig — user registry', () => {
  test('registry hit wins over .freemarkerrc.json walk-up', () => {
    // Build a project layout that has BOTH a registered entry and a
    // .freemarkerrc.json. The registry should win.
    const projectRoot = join(scratch, 'project')
    const nested = join(projectRoot, 'src', 'main', 'resources', 'templates', 'email')
    mkdirSync(nested, { recursive: true })
    writeFileSync(
      join(projectRoot, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'committed' }),
    )

    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [projectRoot]: {
            templatesRoot: 'src/main/resources/templates/email',
            freemarker: { number_format: '#,##0.00' },
          },
        },
      }),
    )

    const cfg = loadConfig(nested, { registryPath })

    expect(cfg.templatesRoot).toBe('src/main/resources/templates/email')
    expect(cfg.projectRoot).toBe(projectRoot)
    expect(cfg.configPath).toBeNull()
    expect(cfg.freemarker).toEqual({ number_format: '#,##0.00' })
  })

  test('registry entry merges into defaults for omitted fields', () => {
    const projectRoot = join(scratch, 'project')
    mkdirSync(projectRoot, { recursive: true })
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [projectRoot]: { templatesRoot: 'templates' },
        },
      }),
    )

    const cfg = loadConfig(projectRoot, { registryPath })

    expect(cfg.templatesRoot).toBe('templates')
    expect(cfg.locale).toBe('en_US')
    expect(cfg.inlineCss).toBe(true)
    expect(cfg.dev).toEqual({ port: 5173, open: true })
    expect(cfg.projectRoot).toBe(projectRoot)
  })

  test('falls through to .freemarkerrc.json when no registry entry matches', () => {
    const projectRoot = join(scratch, 'project')
    mkdirSync(projectRoot, { recursive: true })
    writeFileSync(
      join(projectRoot, '.freemarkerrc.json'),
      JSON.stringify({ templatesRoot: 'committed' }),
    )
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [join(scratch, 'unrelated')]: { templatesRoot: 'x' },
        },
      }),
    )

    const cfg = loadConfig(projectRoot, { registryPath })

    expect(cfg.templatesRoot).toBe('committed')
    expect(cfg.configPath).toBe(join(projectRoot, '.freemarkerrc.json'))
    expect(cfg.projectRoot).toBe(projectRoot)
  })
})
