import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import {
  computeRegistryPath,
  findProjectForCwd,
  loadRegistry,
  type RegistryProjectEntry,
} from './registry.ts'

export interface DevConfig {
  port: number
  open: boolean
}

export type PreviewMissingMode = 'error' | 'placeholder' | 'empty'

export interface Config {
  templatesRoot: string | null
  fixturesRoot: string | null
  locale: string
  inlineCss: boolean
  inlineCssOptions: Record<string, unknown>
  /**
   * When unset, each command applies its own default: `render` defaults to
   * `'error'` (production fidelity for one-shot output); `dev` defaults to
   * `'placeholder'` (better live-edit UX — undefined vars render visibly
   * instead of breaking the preview).
   */
  previewMissingAs?: PreviewMissingMode
  /**
   * Forwarded to FreeMarker Configuration.setSetting(key, value) on the Java
   * side. Use this to match production-side settings that differ from
   * defaults: number_format, date_format, whitespace_stripping,
   * template_exception_handler, etc.
   */
  freemarker: Record<string, string>
  dev: DevConfig
  /**
   * Set when config came from a committed `.freemarkerrc.json`. Null when
   * the config came from the user registry or defaults.
   */
  configPath: string | null
  /**
   * Anchor for resolving relative paths in the config (templatesRoot,
   * fixturesRoot). One of:
   *   - registry match: the registered project key
   *   - `.freemarkerrc.json`: dirname of the config file
   *   - defaults: the cwd loadConfig was called with
   */
  projectRoot: string
}

export interface LoadConfigOptions {
  /** Override the user registry location. Defaults to computeRegistryPath. */
  registryPath?: string
}

const CONFIG_FILENAME = '.freemarkerrc.json'

const DEFAULTS: Omit<Config, 'configPath' | 'previewMissingAs' | 'projectRoot'> =
  {
    templatesRoot: null,
    fixturesRoot: null,
    locale: 'en_US',
    inlineCss: true,
    inlineCssOptions: { preserveMediaQueries: true },
    freemarker: {},
    dev: { port: 5173, open: true },
  }

export function loadConfig(cwd: string, options: LoadConfigOptions = {}): Config {
  const registryPath =
    options.registryPath ??
    computeRegistryPath({
      platform: process.platform,
      homedir: homedir(),
      env: process.env,
    })

  const registry = loadRegistry(registryPath)
  const match = findProjectForCwd(cwd, registry)
  if (match) {
    return fromRegistryEntry(match.entry, match.projectPath)
  }

  const configPath = findConfigFile(cwd)
  if (!configPath) {
    return { ...DEFAULTS, configPath: null, projectRoot: resolve(cwd) }
  }

  const raw = readFileSync(configPath, 'utf8')
  let parsed: Partial<Config>
  try {
    parsed = JSON.parse(raw) as Partial<Config>
  } catch (err) {
    throw new Error(
      `config error in ${configPath}: ${(err as Error).message}`,
    )
  }
  return {
    ...DEFAULTS,
    ...parsed,
    dev: { ...DEFAULTS.dev, ...(parsed.dev ?? {}) },
    configPath,
    projectRoot: dirname(configPath),
  }
}

function fromRegistryEntry(
  entry: RegistryProjectEntry,
  projectRoot: string,
): Config {
  return {
    ...DEFAULTS,
    templatesRoot: entry.templatesRoot ?? DEFAULTS.templatesRoot,
    fixturesRoot: entry.fixturesRoot ?? DEFAULTS.fixturesRoot,
    locale: entry.locale ?? DEFAULTS.locale,
    inlineCss: entry.inlineCss ?? DEFAULTS.inlineCss,
    inlineCssOptions: entry.inlineCssOptions ?? DEFAULTS.inlineCssOptions,
    previewMissingAs: entry.previewMissingAs,
    freemarker: entry.freemarker ?? DEFAULTS.freemarker,
    dev: { ...DEFAULTS.dev, ...(entry.dev ?? {}) },
    configPath: null,
    projectRoot,
  }
}

function findConfigFile(start: string): string | null {
  let current = resolve(start)
  const root = parse(current).root
  while (true) {
    const candidate = join(current, CONFIG_FILENAME)
    if (existsSync(candidate)) return candidate
    if (current === root) return null
    current = dirname(current)
  }
}
