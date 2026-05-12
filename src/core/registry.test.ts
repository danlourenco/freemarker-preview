import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadRegistry,
  saveRegistry,
  findProjectForCwd,
  computeRegistryPath,
  type Registry,
  type RegistryProjectEntry,
} from './registry.ts'

let scratch: string
let registryPath: string

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fmp-registry-')))
  registryPath = join(scratch, 'registry.json')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('registry I/O', () => {
  test('loadRegistry returns empty when file does not exist', () => {
    expect(loadRegistry(registryPath)).toEqual({ projects: {} })
  })

  test('saveRegistry then loadRegistry round-trips', () => {
    const input: Registry = {
      projects: {
        '/Users/dlo/Dev/agreement': {
          templatesRoot: 'src/main/resources/templates/email',
          freemarker: { number_format: '#,##0.00' },
        },
      },
    }
    saveRegistry(registryPath, input)

    expect(existsSync(registryPath)).toBe(true)
    expect(loadRegistry(registryPath)).toEqual(input)
  })

  test('saveRegistry creates the parent directory if missing', () => {
    const nested = join(scratch, 'deeply/nested/dir/registry.json')
    const input: Registry = { projects: { '/x': { templatesRoot: '.' } } }

    saveRegistry(nested, input)

    expect(existsSync(nested)).toBe(true)
  })

  test('loadRegistry throws a clear error on malformed JSON', () => {
    writeFileSync(registryPath, '{ not valid')
    expect(() => loadRegistry(registryPath)).toThrowError(/registry/i)
  })
})

describe('findProjectForCwd', () => {
  const reg: Registry = {
    projects: {
      '/Users/dlo/Dev/agreement': { templatesRoot: 'a' },
      '/Users/dlo/Dev/agreement/sub': { templatesRoot: 'b' },
      '/Users/dlo/Dev/other': { templatesRoot: 'c' },
    },
  }

  test('exact match returns that entry', () => {
    const got = findProjectForCwd('/Users/dlo/Dev/agreement', reg)
    expect(got?.projectPath).toBe('/Users/dlo/Dev/agreement')
  })

  test('walks up from a subdirectory to find the nearest registered project', () => {
    const got = findProjectForCwd(
      '/Users/dlo/Dev/agreement/src/main/resources/templates/email',
      reg,
    )
    expect(got?.projectPath).toBe('/Users/dlo/Dev/agreement')
  })

  test('longest-prefix match wins when nested projects are registered', () => {
    const got = findProjectForCwd('/Users/dlo/Dev/agreement/sub/inner', reg)
    expect(got?.projectPath).toBe('/Users/dlo/Dev/agreement/sub')
  })

  test('returns null when no ancestor is registered', () => {
    const got = findProjectForCwd('/Users/dlo/Dev/unrelated/path', reg)
    expect(got).toBeNull()
  })
})

describe('computeRegistryPath', () => {
  test('Windows: %APPDATA%/freemarker-preview/projects.json', () => {
    const got = computeRegistryPath({
      platform: 'win32',
      homedir: 'C:\\Users\\jane',
      env: { APPDATA: 'C:\\Users\\jane\\AppData\\Roaming' },
    })
    expect(got).toBe(
      'C:\\Users\\jane\\AppData\\Roaming\\freemarker-preview\\projects.json',
    )
  })

  test('POSIX with XDG_CONFIG_HOME respects it', () => {
    const got = computeRegistryPath({
      platform: 'linux',
      homedir: '/home/jane',
      env: { XDG_CONFIG_HOME: '/var/config' },
    })
    expect(got).toBe('/var/config/freemarker-preview/projects.json')
  })

  test('macOS without XDG_CONFIG_HOME defaults to ~/.config/...', () => {
    const got = computeRegistryPath({
      platform: 'darwin',
      homedir: '/Users/jane',
      env: {},
    })
    expect(got).toBe('/Users/jane/.config/freemarker-preview/projects.json')
  })

  test('FMP_REGISTRY_PATH override always wins', () => {
    const got = computeRegistryPath({
      platform: 'linux',
      homedir: '/home/jane',
      env: { FMP_REGISTRY_PATH: '/tmp/x.json' },
    })
    expect(got).toBe('/tmp/x.json')
  })
})
