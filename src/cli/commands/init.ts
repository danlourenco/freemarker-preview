import { writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, relative, resolve } from 'node:path'
import { confirm, select } from '@inquirer/prompts'
import { detectProjectLayout } from '../../core/detect.ts'
import { render } from '../../core/render.ts'
import {
  computeRegistryPath,
  loadRegistry,
  saveRegistry,
  type Registry,
  type RegistryProjectEntry,
} from '../../core/registry.ts'

export interface InitArgs {
  force: boolean
  noWarmup: boolean
}

export function parseInitArgs(argv: string[]): InitArgs {
  let force = false
  let noWarmup = false
  for (const arg of argv) {
    if (arg === '--force') force = true
    else if (arg === '--no-warmup') noWarmup = true
  }
  return { force, noWarmup }
}

/**
 * Minimal seam for tests / non-interactive callers. The default impl wraps
 * @inquirer/prompts; tests can inject a stub.
 */
export interface InitPrompter {
  confirmUseDetected(detectedDir: string): Promise<boolean>
  pickDirectory(start: string): Promise<string | null>
  confirmOverwrite(projectRoot: string): Promise<boolean>
}

const defaultPrompter: InitPrompter = {
  confirmUseDetected: (detectedDir) =>
    confirm({
      message: `Use detected templates directory?\n  ${detectedDir}`,
      default: true,
    }),
  pickDirectory: pickDirectoryInteractive,
  confirmOverwrite: (projectRoot) =>
    confirm({
      message: `A registry entry already exists for ${projectRoot}. Overwrite?`,
      default: false,
    }),
}

export async function runInit(
  argv: string[],
  prompter: InitPrompter = defaultPrompter,
): Promise<number> {
  const args = parseInitArgs(argv)
  const cwd = process.cwd()

  const layout = detectProjectLayout(cwd)
  const projectRoot = layout.projectRoot ?? cwd

  if (layout.kind === 'spring-boot' && layout.projectRoot) {
    process.stdout.write(`detected Spring Boot project at ${projectRoot}\n`)
  } else {
    process.stdout.write(
      `no Spring Boot build file detected — using cwd as project root: ${projectRoot}\n`,
    )
  }

  const registryPath = computeRegistryPath({
    platform: process.platform,
    homedir: homedir(),
    env: process.env,
  })
  const registry = loadRegistry(registryPath)

  if (registry.projects[projectRoot] && !args.force) {
    const ok = await prompter.confirmOverwrite(projectRoot)
    if (!ok) {
      process.stdout.write('aborted.\n')
      return 1
    }
  }

  let chosenDir: string | null = null
  if (layout.templatesDir) {
    const useIt = await prompter.confirmUseDetected(layout.templatesDir)
    if (useIt) chosenDir = layout.templatesDir
  }
  if (!chosenDir) {
    chosenDir = await prompter.pickDirectory(projectRoot)
    if (!chosenDir) {
      process.stdout.write('cancelled.\n')
      return 1
    }
  }

  // Store templatesRoot as a relative path from the project root so the
  // registry entry stays portable across machines that share the project key.
  // (When the user picks the project root itself, relative returns '' — keep
  // it as '.' so config consumers don't see an empty string.)
  const templatesRoot = relative(projectRoot, chosenDir) || '.'

  const entry: RegistryProjectEntry = { templatesRoot }
  const next: Registry = {
    projects: { ...registry.projects, [projectRoot]: entry },
  }
  saveRegistry(registryPath, next)

  process.stdout.write(`wrote ${registryPath}\n`)
  process.stdout.write(`  projectRoot:   ${projectRoot}\n`)
  process.stdout.write(`  templatesRoot: ${templatesRoot}\n`)

  if (!args.noWarmup) {
    try {
      await prewarmJBang()
      process.stdout.write(`  pre-warmed JBang FreeMarker dep cache\n`)
    } catch (err) {
      process.stderr.write(
        `  warning: JBang pre-warm failed (${(err as Error).message}). ` +
          `First render will pay the cold-start cost.\n`,
      )
    }
  }

  return 0
}

const SENTINEL_SELECT = '__fmp_select_current__'
const SENTINEL_PARENT = '__fmp_parent__'
const SENTINEL_CANCEL = '__fmp_cancel__'

async function pickDirectoryInteractive(start: string): Promise<string | null> {
  let current = resolve(start)
  while (true) {
    const subdirs = listSubdirectories(current)
    const fsRoot = parse(current).root
    const choices: { name: string; value: string }[] = [
      { name: `[ select this directory: ${current} ]`, value: SENTINEL_SELECT },
    ]
    if (current !== fsRoot) {
      choices.push({ name: '..  (parent)', value: SENTINEL_PARENT })
    }
    for (const name of subdirs) {
      choices.push({ name, value: name })
    }
    choices.push({ name: '[ cancel ]', value: SENTINEL_CANCEL })

    const choice = await select({
      message: `pick templates directory (current: ${current})`,
      choices,
      pageSize: 15,
    })

    if (choice === SENTINEL_SELECT) return current
    if (choice === SENTINEL_CANCEL) return null
    if (choice === SENTINEL_PARENT) {
      current = dirname(current)
      continue
    }
    current = join(current, choice)
  }
}

function listSubdirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/**
 * Render a tiny no-op template once so JBang fetches the FreeMarker JAR
 * into its dep cache. Run from a temp dir so we don't pollute cwd.
 */
async function prewarmJBang(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'fmp-warmup-'))
  try {
    const tplPath = join(dir, 'warmup.ftlh')
    const fixPath = join(dir, 'warmup.json')
    writeFileSync(tplPath, 'ok\n', 'utf8')
    writeFileSync(fixPath, '{}', 'utf8')
    await render(tplPath, fixPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
