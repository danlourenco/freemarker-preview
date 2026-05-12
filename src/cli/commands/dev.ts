import { resolve } from 'node:path'
import open from 'open'
import { DevServer } from '../../server/index.ts'
import { loadConfig } from '../../core/config.ts'
import type { PreviewMissingAs } from '../../core/render.ts'

const VALID_MISSING_MODES: readonly PreviewMissingAs[] = [
  'error',
  'placeholder',
  'empty',
]

function parseMissingFlag(value: string | undefined): PreviewMissingAs {
  if (!VALID_MISSING_MODES.includes(value as PreviewMissingAs)) {
    throw new Error(
      `--missing must be one of ${VALID_MISSING_MODES.join(' | ')} (got ${value})`,
    )
  }
  return value as PreviewMissingAs
}

export interface DevArgs {
  port?: number
  open: boolean
  missing?: PreviewMissingAs
}

export function parseDevArgs(argv: string[]): DevArgs {
  let port: number | undefined
  let openFlag = true
  let missing: PreviewMissingAs | undefined

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--port') {
      const n = Number(argv[i + 1])
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`dev: invalid --port value: ${argv[i + 1]}`)
      }
      port = n
      i += 2
      continue
    }
    if (arg === '--no-open') {
      openFlag = false
      i += 1
      continue
    }
    if (arg === '--missing') {
      missing = parseMissingFlag(argv[i + 1])
      i += 2
      continue
    }
    i += 1
  }

  return { port, open: openFlag, missing }
}

export async function runDev(argv: string[]): Promise<number> {
  let args: DevArgs
  try {
    args = parseDevArgs(argv)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  const cfg = loadConfig(process.cwd())
  const templatesRoot = cfg.templatesRoot
    ? resolve(cfg.projectRoot, cfg.templatesRoot)
    : process.cwd()
  const fixturesRoot = cfg.fixturesRoot
    ? resolve(cfg.projectRoot, cfg.fixturesRoot)
    : null

  // dev defaults to 'placeholder' so undefined variables render as visible
  // pills inline rather than blocking the whole preview with the error overlay.
  // CLI flag > config > command default.
  const missingMode: PreviewMissingAs =
    args.missing ?? cfg.previewMissingAs ?? 'placeholder'

  const server = new DevServer({
    templatesRoot,
    fixturesRoot,
    port: args.port ?? cfg.dev.port,
    inlineCss: cfg.inlineCss,
    inlineCssOptions: cfg.inlineCssOptions,
    previewMissingAs: missingMode,
    freemarkerSettings: cfg.freemarker,
  })

  const wantsOpen = args.open && cfg.dev.open

  let started: { url: string; port: number }
  try {
    started = await server.start()
  } catch (err) {
    process.stderr.write(`failed to start dev server: ${(err as Error).message}\n`)
    return 1
  }

  process.stdout.write(`freemarker-preview dev on ${started.url}\n`)
  process.stdout.write(`  templatesRoot: ${templatesRoot}\n`)
  process.stdout.write(`  missing vars:  ${missingMode}\n`)

  if (wantsOpen) {
    try {
      await open(started.url)
    } catch {
      /* don't fail dev start on browser-open issues */
    }
  }

  let shuttingDown = false
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    process.stdout.write('\nshutting down...\n')
    try {
      await server.stop()
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  await new Promise(() => {
    /* hold the event loop open until SIGINT */
  })
  return 0
}
