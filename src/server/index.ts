import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect as netConnect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { RenderDaemon } from '../core/daemon.ts'
import { resolveFixtureOrEmpty } from '../core/fixtures.ts'
import { FreemarkerError } from '../core/errors.ts'
import { extractSnippet, type Snippet } from '../core/format-error.ts'
import { inlineCss } from '../core/inline.ts'
import { Watcher } from './watcher.ts'

export interface DevServerOptions {
  templatesRoot: string
  fixturesRoot?: string | null
  port?: number
  inlineCss?: boolean
  inlineCssOptions?: Record<string, unknown>
  previewMissingAs?: 'error' | 'placeholder' | 'empty'
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
  private readonly fixturesRoot: string | null
  private readonly preferredPort: number
  private readonly inlineCssEnabled: boolean
  private readonly inlineCssOptions: Record<string, unknown>
  private readonly missingMode: 'error' | 'placeholder' | 'empty'
  private readonly freemarkerSettings: Record<string, string>

  private daemon: RenderDaemon | null = null
  private watcher: Watcher | null = null
  private server: Server | null = null
  private sseClients = new Set<ServerResponse>()
  private actualPort: number | null = null
  private emptyFixtureDir: string | null = null
  private emptyFixturePath: string | null = null

  constructor(opts: DevServerOptions) {
    this.templatesRoot = resolve(opts.templatesRoot)
    this.fixturesRoot = opts.fixturesRoot
      ? resolve(opts.fixturesRoot)
      : null
    this.preferredPort = opts.port ?? DEFAULT_PORT
    this.inlineCssEnabled = opts.inlineCss ?? true
    this.inlineCssOptions = opts.inlineCssOptions ?? { preserveMediaQueries: true }
    this.missingMode = opts.previewMissingAs ?? 'error'
    this.freemarkerSettings = opts.freemarkerSettings ?? {}
  }

  async start(): Promise<{ url: string; port: number }> {
    // Pre-create a {} fixture file once. Templates without a fixture render
    // against this so the preview still shows something instead of a
    // fixture-read error blocking everything.
    this.emptyFixtureDir = mkdtempSync(join(tmpdir(), 'fmp-empty-fixture-'))
    this.emptyFixturePath = join(this.emptyFixtureDir, 'empty.json')
    writeFileSync(this.emptyFixturePath, '{}', 'utf8')

    this.daemon = new RenderDaemon({
      templatesRoot: this.templatesRoot,
      previewMissingAs: this.missingMode,
      freemarkerSettings: this.freemarkerSettings,
    })

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
    if (this.emptyFixtureDir) {
      rmSync(this.emptyFixtureDir, { recursive: true, force: true })
      this.emptyFixtureDir = null
      this.emptyFixturePath = null
    }
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
      const resolved = resolveFixtureOrEmpty(
        templatePath,
        fixtureName,
        this.emptyFixturePath!,
      )
      fixturePath = resolved.path
      if (resolved.fallback) {
        // Surface the fact that this render used {} via a response header.
        // The client can read it and show a non-blocking notice. Headers
        // don't disturb the rendered HTML body itself.
        res.setHeader('x-fmp-fixtureless', '1')
      }
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
      let out = this.inlineCssEnabled
        ? inlineCss(html, this.inlineCssOptions)
        : html
      if (url.searchParams.get('dark') === '1') {
        out = promoteDarkRules(out)
      }

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


/**
 * For dark-mode preview, find @media (prefers-color-scheme: dark) blocks in
 * the rendered HTML's surviving <style> tags and emit their contents
 * unconditionally, appended to <head>. This makes the dark rules apply even
 * though the iframe itself isn't actually under a dark OS preference.
 *
 * The original media block stays in place (so light mode still works on
 * subsequent toggles) — we just pile the dark rules on top with later cascade
 * order. A meta color-scheme hint is added so `system` UI elements (form
 * controls, scrollbars) also reflect dark.
 */
export function promoteDarkRules(html: string): string {
  const styleBlockRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  // Match `@media <query>` where <query> contains `prefers-color-scheme: dark`
  // anywhere up to the opening `{`. Captures multi-condition queries too:
  //   @media (prefers-color-scheme: dark) and (max-width: 600px) { ... }
  const darkMediaRe =
    /@media\s+[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/g

  const promoted: string[] = []
  let m: RegExpExecArray | null
  while ((m = styleBlockRe.exec(html))) {
    const css = m[1] ?? ''
    let dm: RegExpExecArray | null
    while ((dm = darkMediaRe.exec(css))) {
      const inner = dm[1]
      if (inner) promoted.push(inner.trim())
    }
  }

  if (promoted.length === 0) {
    // No dark rules to promote — still hint UA color-scheme via meta.
    return injectIntoHead(html, '<meta name="color-scheme" content="dark">')
  }

  // juice inlines the unconditional rules into `style="..."` attributes.
  // Inline styles beat any `<style>` selector via specificity, so the
  // promoted dark rules need !important to actually win the cascade.
  const importanted = promoted.map(addImportantToDeclarations).join('\n')

  const promotedStyle =
    `<meta name="color-scheme" content="dark">\n` +
    `<style data-fmp-dark-promoted>\n${importanted}\n</style>`
  return injectIntoHead(html, promotedStyle)
}

function addImportantToDeclarations(css: string): string {
  return css.replace(
    /([\w-]+\s*:\s*[^;}]+?)(\s*[;}])/g,
    (match, decl: string, end: string) => {
      if (/!\s*important/i.test(decl)) return match
      return `${decl} !important${end}`
    },
  )
}

function injectIntoHead(html: string, fragment: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${fragment}\n</head>`)
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${fragment}`)
  }
  // No <head> at all — prepend so the rule still wins via cascade order.
  return `${fragment}\n${html}`
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
  fixtures: string[]
}

async function buildManifest(root: string): Promise<ManifestTemplate[]> {
  const { readdir, stat } = await import('node:fs/promises')
  const templateNames = await walkTemplates(root)
  const out: ManifestTemplate[] = []
  for (const name of templateNames) {
    const tplAbs = join(root, name)
    const stem = basenameNoExt(name)
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : ''
    const fixturesDirRel = dir ? `${dir}/${stem}.fixtures` : `${stem}.fixtures`
    const fixturesDirAbs = join(root, fixturesDirRel)

    let fixtures: string[] = []
    try {
      const s = await stat(fixturesDirAbs)
      if (s.isDirectory()) {
        const entries = await readdir(fixturesDirAbs)
        fixtures = entries
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace(/\.json$/, ''))
          .sort()
      }
    } catch {
      // no .fixtures/ directory — try sibling fallback
      const siblingRel = dir ? `${dir}/${stem}.json` : `${stem}.json`
      const siblingAbs = join(root, siblingRel)
      try {
        await stat(siblingAbs)
        fixtures = [stem]
      } catch {
        // no fixture at all
      }
    }
    out.push({ name, fixtures })
    void tplAbs
  }
  return out
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
        if (e.name.endsWith('.fixtures')) continue
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

function basenameNoExt(name: string): string {
  const slash = name.lastIndexOf('/')
  const base = slash >= 0 ? name.slice(slash + 1) : name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
