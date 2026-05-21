import { resolve } from 'node:path'
import open from 'open'
import { DevServer } from '../../server/index.ts'
import { loadConfig } from '../../core/config.ts'

export interface DevArgs {
  port?: number
  open: boolean
}

export function parseDevArgs(argv: string[]): DevArgs {
  let port: number | undefined
  let openFlag = true

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
    i += 1
  }

  return { port, open: openFlag }
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

  const server = new DevServer({
    templatesRoot,
    port: args.port ?? cfg.dev.port,
    inlineCss: cfg.inlineCss,
    inlineCssOptions: cfg.inlineCssOptions,
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
