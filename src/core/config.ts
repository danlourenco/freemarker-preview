import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'

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
  previewMissingAs: PreviewMissingMode
  dev: DevConfig
  configPath: string | null
}

const CONFIG_FILENAME = '.freemarkerrc.json'

const DEFAULTS: Omit<Config, 'configPath'> = {
  templatesRoot: null,
  fixturesRoot: null,
  locale: 'en_US',
  inlineCss: true,
  inlineCssOptions: { preserveMediaQueries: true },
  previewMissingAs: 'error',
  dev: { port: 5173, open: true },
}

export function loadConfig(cwd: string): Config {
  const configPath = findConfigFile(cwd)
  if (!configPath) {
    return { ...DEFAULTS, configPath: null }
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
