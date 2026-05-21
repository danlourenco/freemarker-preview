import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect as netConnect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { RenderDaemon } from '../core/daemon.ts'
import { FreemarkerError } from '../core/errors.ts'
import { extractSnippet, type Snippet } from '../core/format-error.ts'
import { inlineCss } from '../core/inline.ts'
import { Watcher } from './watcher.ts'

export interface DevServerOptions {
  templatesRoot: string
  port?: number
  inlineCss?: boolean
  inlineCssOptions?: Record<string, unknown>
  freemarkerSettings?: Record<string, string>
}

const DEFAULT_PORT = 5173
const PORT_WALK_LIMIT = 5
const PUBLIC_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'public',
)

export class DevServer {
  private readonly templatesRoot: string
  private readonly preferredPort: number
  private readonly inlineCssEnabled: boolean
  private readonly inlineCssOptions: Record<string, unknown>
  private readonly freemarkerSettings: Record<string, string>

  private daemon: RenderDaemon | null = null
  private watcher: Watcher | null = null
  private server: Server | null = null
  private sseClients = new Set<ServerResponse>()
  private actualPort: number | null = null

  constructor(opts: DevServerOptions) {
    this.templatesRoot = resolve(opts.templatesRoot)
    this.preferredPort = opts.port ?? DEFAULT_PORT
    this.inlineCssEnabled = opts.inlineCss ?? true
    this.inlineCssOptions = opts.inlineCssOptions ?? { preserveMediaQueries: true }
    this.freemarkerSettings = opts.freemarkerSettings ?? {}
  }

  async start(): Promise<{ url: string; port: number }> {
    this.daemon = new RenderDaemon({
      templatesRoot: this.templatesRoot,
      freemarkerSettings: this.freemarkerSettings,
    })

    const watchRoots = [this.templatesRoot]
    this.watcher = new Watcher({ roots: watchRoots })
    this.watcher.on('change', () => this.broadcastReload())
    await this.watcher.start()

    this.server = createServer((req, res) => this.handle(req, res))
    this.actualPort = await this.listenWithPortWalk(this.server)

    return {
      port: this.actualPort,
      url: `http://localhost:${this.actualPort}`,
    }
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      try { client.end() } catch { /* ignore */ }
    }
    this.sseClients.clear()
    await new Promise<void>((res) => {
      if (!this.server) return res()
      this.server.close(() => res())
    })
    this.server = null
    await this.watcher?.stop()
    this.watcher = null
    await this.daemon?.shutdown()
    this.daemon = null
  }

  private listenWithPortWalk(server: Server): Promise<number> {
    return listenWithPortWalk(server, this.preferredPort, PORT_WALK_LIMIT)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost`)
    const pathname = url.pathname

    try {
      if (pathname === '/' || pathname === '/index.html') {
        return await this.serveFile(res, 'index.html', 'text/html; charset=utf-8')
      }
      if (pathname === '/shell.js') {
        return await this.serveFile(res, 'shell.js', 'application/javascript; charset=utf-8')
      }
      if (pathname === '/mode.js') {
        return await this.serveFile(res, 'mode.js', 'application/javascript; charset=utf-8')
      }
      if (pathname === '/shell.css') {
        return await this.serveFile(res, 'shell.css', 'text/css; charset=utf-8')
      }
      if (pathname === '/render') {
        return await this.serveRender(url, res)
      }
      if (pathname === '/events') {
        return this.serveSSE(req, res)
      }
      if (pathname === '/api/discover') {
        return await this.serveDiscover(res)
      }
      if (pathname === '/api/manifest') {
        return await this.serveManifest(res)
      }

      res.statusCode = 404
      res.end('not found')
    } catch (err) {
      res.statusCode = 500
      res.end(`server error: ${(err as Error).message}`)
    }
  }

  private async serveFile(
    res: ServerResponse,
    filename: string,
    contentType: string,
  ): Promise<void> {
    const buf = await readFile(join(PUBLIC_DIR, filename))
    res.statusCode = 200
    res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'no-store')
    res.end(buf)
  }

  private async serveRender(url: URL, res: ServerResponse): Promise<void> {
    const templateName = url.searchParams.get('template')

    if (!templateName) {
      res.statusCode = 400
      res.end('missing ?template')
      return
    }
    if (!this.daemon) {
      res.statusCode = 503
      res.end('daemon not running')
      return
    }

    const templatePathFallback = resolve(this.templatesRoot, templateName)

    try {
      const { html } = await this.daemon.render({ templateName })
      const out = this.inlineCssEnabled
        ? inlineCss(html, this.inlineCssOptions)
        : html

      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(out)
    } catch (err) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      const fmErr = err instanceof FreemarkerError ? err : null
      const snippet = fmErr ? await readSnippet(fmErr) : undefined
      const body = fmErr
        ? {
            ok: false,
            error: {
              type: fmErr.type,
              message: fmErr.message,
              line: fmErr.line,
              column: fmErr.column,
              templatePath: fmErr.templatePath,
              snippet,
            },
          }
        : {
            ok: false,
            error: {
              type: 'internal',
              message: (err as Error).message,
              templatePath: templatePathFallback,
            },
          }
      res.end(JSON.stringify(body))
    }
  }

  private serveSSE(req: IncomingMessage, res: ServerResponse): void {
    res.statusCode = 200
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('connection', 'keep-alive')
    res.write(': connected\n\n')

    this.sseClients.add(res)
    req.on('close', () => {
      this.sseClients.delete(res)
    })
  }

  private async serveDiscover(res: ServerResponse): Promise<void> {
    const first = await firstTemplateUnder(this.templatesRoot)
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ firstTemplate: first }))
  }

  private async serveManifest(res: ServerResponse): Promise<void> {
    const templates = await buildManifest(this.templatesRoot)
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ templates }))
  }

  private broadcastReload(): void {
    const message = `data: ${JSON.stringify({ type: 'reload' })}\n\n`
    for (const client of this.sseClients) {
      try { client.write(message) } catch { /* dropped */ }
    }
  }
}

/**
 * Walk forward from `preferredPort` up to `walkLimit` extra ports until we
 * find one that is (a) not answering an existing TCP connection on
 * `localhost` (any IP family) and (b) successfully accepts our bind.
 *
 * Catches the cross-family squatter case (e.g. Vite on `::1:5173` while our
 * bind to `127.0.0.1:5173` would succeed silently and the browser would
 * resolve `localhost` to the squatter).
 */
export async function listenWithPortWalk(
  server: Server,
  preferredPort: number,
  walkLimit: number,
  probeTimeoutMs = 200,
): Promise<number> {
  for (let i = 0; i <= walkLimit; i++) {
    const port = preferredPort + i
    if (await isPortAnswering(port, probeTimeoutMs)) continue
    try {
      return await listenOn(server, port)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') continue
      throw err
    }
  }
  throw new Error(
    `ports ${preferredPort}..${preferredPort + walkLimit} are all busy`,
  )
}

function isPortAnswering(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host: 'localhost', port })
    let settled = false
    const finish = (answering: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(answering)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function listenOn(server: Server, port: number): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const onError = (err: Error): void => {
      server.removeListener('listening', onListen)
      rejectP(err)
    }
    const onListen = (): void => {
      server.removeListener('error', onError)
      resolveP(port)
    }
    server.once('error', onError)
    server.once('listening', onListen)
    server.listen(port, '127.0.0.1')
  })
}


async function readSnippet(err: FreemarkerError): Promise<Snippet | undefined> {
  if (!err.line || !err.templatePath) return undefined
  try {
    const source = await readFile(err.templatePath, 'utf8')
    return extractSnippet(source, err.line)
  } catch {
    return undefined
  }
}

async function firstTemplateUnder(root: string): Promise<string | null> {
  const found = await walkTemplates(root)
  return found[0] ?? null
}

interface ManifestTemplate {
  name: string
}

async function buildManifest(root: string): Promise<ManifestTemplate[]> {
  const templateNames = await walkTemplates(root)
  return templateNames.map((name) => ({ name }))
}

async function walkTemplates(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const found: string[] = []
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const next = join(dir, e.name)
      const nextRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        await walk(next, nextRel)
      } else if (e.name.endsWith('.ftlh') || e.name.endsWith('.ftl')) {
        found.push(nextRel)
      }
    }
  }
  await walk(root, '')
  found.sort()
  return found
}

