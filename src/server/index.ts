import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { RenderDaemon } from '../core/daemon.ts'
import { resolveFixture } from '../core/fixtures.ts'
import { FreemarkerError } from '../core/errors.ts'
import { extractSnippet, type Snippet } from '../core/format-error.ts'
import { Watcher } from './watcher.ts'

export interface DevServerOptions {
  templatesRoot: string
  fixturesRoot?: string | null
  port?: number
}

const DEFAULT_PORT = 5173
const PORT_WALK_LIMIT = 5
const PUBLIC_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'public',
)

export class DevServer {
  private readonly templatesRoot: string
  private readonly fixturesRoot: string | null
  private readonly preferredPort: number

  private daemon: RenderDaemon | null = null
  private watcher: Watcher | null = null
  private server: Server | null = null
  private sseClients = new Set<ServerResponse>()
  private actualPort: number | null = null

  constructor(opts: DevServerOptions) {
    this.templatesRoot = resolve(opts.templatesRoot)
    this.fixturesRoot = opts.fixturesRoot
      ? resolve(opts.fixturesRoot)
      : null
    this.preferredPort = opts.port ?? DEFAULT_PORT
  }

  async start(): Promise<{ url: string; port: number }> {
    this.daemon = new RenderDaemon({ templatesRoot: this.templatesRoot })

    const watchRoots = [this.templatesRoot]
    if (this.fixturesRoot && this.fixturesRoot !== this.templatesRoot) {
      watchRoots.push(this.fixturesRoot)
    }
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
    return new Promise((resolveP, rejectP) => {
      let port = this.preferredPort
      const tryListen = (): void => {
        const onError = (err: NodeJS.ErrnoException): void => {
          if (err.code !== 'EADDRINUSE') return rejectP(err)
          if (port - this.preferredPort >= PORT_WALK_LIMIT) {
            return rejectP(
              new Error(
                `ports ${this.preferredPort}..${this.preferredPort + PORT_WALK_LIMIT} are all busy`,
              ),
            )
          }
          port++
          server.removeListener('error', onError)
          tryListen()
        }
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', onError)
          resolveP(port)
        })
      }
      tryListen()
    })
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
    const fixtureName = url.searchParams.get('fixture') ?? undefined

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

    const templatePath = resolve(this.templatesRoot, templateName)
    let fixturePath: string
    try {
      fixturePath = resolveFixture(templatePath, fixtureName)
    } catch (err) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            type: 'fixture-read',
            message: (err as Error).message,
            templatePath,
          },
        }),
      )
      return
    }

    try {
      const { html } = await this.daemon.render({ templateName, fixturePath })
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(html)
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
              templatePath,
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

  private broadcastReload(): void {
    const message = `data: ${JSON.stringify({ type: 'reload' })}\n\n`
    for (const client of this.sseClients) {
      try { client.write(message) } catch { /* dropped */ }
    }
  }
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
  const { readdir } = await import('node:fs/promises')
  const found: string[] = []
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const next = join(dir, e.name)
      const nextRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name.endsWith('.fixtures')) continue
        await walk(next, nextRel)
      } else if (e.name.endsWith('.ftlh') || e.name.endsWith('.ftl')) {
        found.push(nextRel)
      }
    }
  }
  await walk(root, '')
  found.sort()
  return found[0] ?? null
}
