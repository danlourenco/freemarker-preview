import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, parse, resolve, sep } from 'node:path'

export interface RegistryProjectEntry {
  templatesRoot: string
  locale?: string
  inlineCss?: boolean
  inlineCssOptions?: Record<string, unknown>
  freemarker?: Record<string, string>
  dev?: { port?: number; open?: boolean }
}

export interface Registry {
  projects: Record<string, RegistryProjectEntry>
}

export interface RegistryMatch {
  projectPath: string
  entry: RegistryProjectEntry
}

export interface ComputeRegistryPathInput {
  platform: NodeJS.Platform
  homedir: string
  env: NodeJS.ProcessEnv
}

const EMPTY: Registry = { projects: {} }

export function loadRegistry(path: string): Registry {
  if (!existsSync(path)) return { projects: {} }
  const raw = readFileSync(path, 'utf8')
  try {
    const parsed = JSON.parse(raw) as Partial<Registry>
    return { projects: parsed.projects ?? {} }
  } catch (err) {
    throw new Error(`registry error in ${path}: ${(err as Error).message}`)
  }
}

export function saveRegistry(path: string, reg: Registry): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(reg, null, 2) + '\n', 'utf8')
}

/**
 * Walk up from `cwd`, returning the longest-prefix match in the registry.
 * Walking the directory chain (rather than scanning all keys for a string
 * prefix match) avoids false positives like `/foo/barbaz` matching key
 * `/foo/bar` — those are sibling paths, not ancestors.
 */
export function findProjectForCwd(
  cwd: string,
  reg: Registry,
): RegistryMatch | null {
  let dir = resolve(cwd)
  const root = parse(dir).root
  while (true) {
    const entry = reg.projects[dir]
    if (entry) return { projectPath: dir, entry }
    if (dir === root) return null
    dir = dirname(dir)
  }
}

/**
 * Resolve the registry file path for the current user.
 *
 * Precedence:
 *   1. FMP_REGISTRY_PATH env var (test/override hatch)
 *   2. Windows: %APPDATA%\freemarker-preview\projects.json
 *   3. POSIX: $XDG_CONFIG_HOME/freemarker-preview/projects.json
 *      else ~/.config/freemarker-preview/projects.json
 */
export function computeRegistryPath(input: ComputeRegistryPathInput): string {
  const { platform, homedir, env } = input
  if (env.FMP_REGISTRY_PATH) return env.FMP_REGISTRY_PATH
  if (platform === 'win32') {
    const appdata = env.APPDATA ?? join(homedir, 'AppData', 'Roaming')
    return windowsJoin(appdata, 'freemarker-preview', 'projects.json')
  }
  const base = env.XDG_CONFIG_HOME ?? join(homedir, '.config')
  return join(base, 'freemarker-preview', 'projects.json')
}

/**
 * Path joiner that always uses backslashes regardless of the host platform.
 * Required for the Windows branch because the tests run on POSIX, where
 * Node's path.join would otherwise emit forward slashes.
 */
function windowsJoin(...parts: string[]): string {
  return parts.join('\\')
}
