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
  // Bare single-candidate layout. Multi-candidate tests add subdirs inline.
  templatesDir = join(projectRoot, 'src', 'main', 'resources', 'templates')
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
    chooseFromCandidates: vi.fn().mockResolvedValue(null),
    pickDirectory: vi.fn().mockResolvedValue(null),
    confirmOverwrite: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('runInit — single-candidate flow (confirmUseDetected)', () => {
  test('accepting the detected dir writes that dir as templatesRoot', async () => {
    process.chdir(projectRoot)
    const prompter = stubPrompter()

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.confirmUseDetected).toHaveBeenCalledWith(templatesDir)
    expect(prompter.chooseFromCandidates).not.toHaveBeenCalled()
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates',
    })
  })

  test('rejecting the detected dir falls through to the directory picker', async () => {
    process.chdir(projectRoot)
    const picked = join(projectRoot, 'src', 'main', 'resources')
    const prompter = stubPrompter({
      confirmUseDetected: vi.fn().mockResolvedValue(false),
      pickDirectory: vi.fn().mockResolvedValue(picked),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.pickDirectory).toHaveBeenCalledWith(projectRoot)
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources',
    })
  })
})

describe('runInit — multi-candidate flow (chooseFromCandidates)', () => {
  test('from inside templates/email: picks the email subdir from the candidate list', async () => {
    const emailDir = join(templatesDir, 'email')
    mkdirSync(emailDir, { recursive: true })
    process.chdir(emailDir)

    const prompter = stubPrompter({
      chooseFromCandidates: vi.fn().mockResolvedValue(emailDir),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.chooseFromCandidates).toHaveBeenCalledWith([
      templatesDir,
      emailDir,
    ])
    expect(prompter.confirmUseDetected).not.toHaveBeenCalled()
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources/templates/email',
    })
  })

  test('select prompt returning "picker" drops into the directory picker', async () => {
    const emailDir = join(templatesDir, 'email')
    mkdirSync(emailDir, { recursive: true })
    process.chdir(projectRoot)

    const picked = join(projectRoot, 'src', 'main', 'resources')
    const prompter = stubPrompter({
      chooseFromCandidates: vi.fn().mockResolvedValue('picker'),
      pickDirectory: vi.fn().mockResolvedValue(picked),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.pickDirectory).toHaveBeenCalledWith(projectRoot)
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({
      templatesRoot: 'src/main/resources',
    })
  })

  test('select prompt returning null cancels without writing the registry', async () => {
    mkdirSync(join(templatesDir, 'email'), { recursive: true })
    process.chdir(projectRoot)

    const prompter = stubPrompter({
      chooseFromCandidates: vi.fn().mockResolvedValue(null),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(1)
    expect(prompter.pickDirectory).not.toHaveBeenCalled()
    const reg = loadRegistry(registryPath)
    expect(reg.projects).toEqual({})
  })
})

describe('runInit — zero-candidate flow (straight to picker)', () => {
  test('no templates dirs detected → picker is invoked directly', async () => {
    rmSync(templatesDir, { recursive: true })
    process.chdir(projectRoot)

    const picked = join(projectRoot, 'mytemplates')
    mkdirSync(picked)
    const prompter = stubPrompter({
      pickDirectory: vi.fn().mockResolvedValue(picked),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(0)
    expect(prompter.confirmUseDetected).not.toHaveBeenCalled()
    expect(prompter.chooseFromCandidates).not.toHaveBeenCalled()
    expect(prompter.pickDirectory).toHaveBeenCalledWith(projectRoot)
    const reg = loadRegistry(registryPath)
    expect(reg.projects[projectRoot]).toEqual({ templatesRoot: 'mytemplates' })
  })

  test('zero candidates + picker cancellation → aborts with no registry write', async () => {
    rmSync(templatesDir, { recursive: true })
    process.chdir(projectRoot)

    const prompter = stubPrompter({
      pickDirectory: vi.fn().mockResolvedValue(null),
    })

    const code = await runInit(['--no-warmup'], prompter)

    expect(code).toBe(1)
    const reg = loadRegistry(registryPath)
    expect(reg.projects).toEqual({})
  })
})

describe('runInit — overwrite handling', () => {
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
