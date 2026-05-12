import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit, type InitPrompter } from './init.ts'
import { loadRegistry } from '../../core/registry.ts'

let scratch: string
let projectRoot: string
let templatesDir: string
let registryPath: string
let originalCwd: string
let originalRegistryEnv: string | undefined

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fmp-init-')))
  projectRoot = join(scratch, 'agreement')
  templatesDir = join(projectRoot, 'src', 'main', 'resources', 'templates', 'email')
  mkdirSync(templatesDir, { recursive: true })
  writeFileSync(join(projectRoot, 'pom.xml'), '<project/>', 'utf8')

  registryPath = join(scratch, 'registry.json')
  originalRegistryEnv = process.env.FMP_REGISTRY_PATH
  process.env.FMP_REGISTRY_PATH = registryPath

  originalCwd = process.cwd()
})

afterEach(() => {
  process.chdir(originalCwd)
  if (originalRegistryEnv === undefined) {
    delete process.env.FMP_REGISTRY_PATH
  } else {
    process.env.FMP_REGISTRY_PATH = originalRegistryEnv
  }
  rmSync(scratch, { recursive: true, force: true })
})

function stubPrompter(overrides: Partial<InitPrompter> = {}): InitPrompter {
  return {
    confirmUseDetected: vi.fn().mockResolvedValue(true),
    pickDirectory: vi.fn().mockResolvedValue(null),
    confirmOverwrite: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('runInit', () => {
  test('from inside templates/email: registry keyed by project root, templatesRoot is the path the user picks', async () => {
    process.chdir(templatesDir)
    // User rejects the detected dir (src/main/resources/templates) and
    // picks the deeper email subdir instead.
    const prompter = stubPrompter({
      confirmUseDetected: vi.fn().mockResolvedValue(false),
      pickDirectory: vi.fn().mockResolvedValue(templatesDir),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.confirmUseDetected).toHaveBeenCalled()
    expect(prompter.pickDirectory).toHaveBeenCalledWith(projectRoot)
    const reg = loadRegistry(registryPath)
    expect(Object.keys(reg.projects)).toEqual([projectRoot])
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates/email',
    })
  })

  test('accepting the detected dir uses it as templatesRoot', async () => {
    process.chdir(templatesDir)
    const prompter = stubPrompter()

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates',
    })
  })

  test('user rejecting the detected dir falls through to the directory picker', async () => {
    process.chdir(projectRoot)
    const picked = join(projectRoot, 'src', 'main', 'resources', 'templates')
    const prompter = stubPrompter({
      confirmUseDetected: vi.fn().mockResolvedValue(false),
      pickDirectory: vi.fn().mockResolvedValue(picked),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.pickDirectory).toHaveBeenCalledWith(projectRoot)
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates',
    })
  })

  test('picker cancellation aborts without writing the registry', async () => {
    process.chdir(projectRoot)
    const prompter = stubPrompter({
      confirmUseDetected: vi.fn().mockResolvedValue(false),
      pickDirectory: vi.fn().mockResolvedValue(null),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(1)
    // Registry should not be created when init aborts.
    const reg = loadRegistry(registryPath)
    expect(reg.projects).toEqual({})
  })

  test('prompts before overwriting an existing entry; refusal aborts', async () => {
    process.chdir(projectRoot)
    writeFileSync(
      registryPath,
      JSON.stringify({ projects: { [projectRoot]: { templatesRoot: 'old' } } }),
    )
    const prompter = stubPrompter({
      confirmOverwrite: vi.fn().mockResolvedValue(false),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(1)
    expect(prompter.confirmOverwrite).toHaveBeenCalledWith(projectRoot)
    // Original entry preserved.
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({ templatesRoot: 'old' })
  })

  test('--force skips the overwrite prompt and replaces the entry', async () => {
    process.chdir(projectRoot)
    writeFileSync(
      registryPath,
      JSON.stringify({ projects: { [projectRoot]: { templatesRoot: 'old' } } }),
    )
    const prompter = stubPrompter()

    const code = await runInit(['--no-warmup', '--force'], prompter)

    expect(code).toBe(0)
    expect(prompter.confirmOverwrite).not.toHaveBeenCalled()
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates',
    })
  })

  test('preserves other registered projects when adding a new entry', async () => {
    process.chdir(projectRoot)
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          '/some/other/project': { templatesRoot: 'x' },
        },
      }),
    )
    const prompter = stubPrompter()

    await runInit(['--no-warmup'], prompter)

    const reg = loadRegistry(registryPath)
    expect(Object.keys(reg.projects).sort()).toEqual(
      ['/some/other/project', projectRoot].sort(),
    )
  })
})
