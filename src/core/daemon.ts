import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FreemarkerError, type StructuredError } from './errors.ts'
import { debugLog } from './debug-log.ts'
import type { PreviewMissingAs, RenderResult } from './render.ts'

export interface DaemonOptions {
  templatesRoot: string
  javaScriptPath?: string
  previewMissingAs?: PreviewMissingAs
  freemarkerSettings?: Record<string, string>
}

export interface DaemonRenderRequest {
  templateName: string
  fixturePath: string
}

function defaultJavaScriptPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'java', 'Render.java')
}

interface ResponseEnvelope {
  ok: boolean
  html?: string
  error?: StructuredError
}

interface Pending {
  templateName: string
  fixturePath: string
  templatePath: string
  resolve: (r: RenderResult) => void
  reject: (e: Error) => void
}

const MAX_RESPAWNS = 1

export class RenderDaemon {
  private readonly templatesRoot: string
  private readonly javaScriptPath: string
  private readonly missingMode: PreviewMissingAs
  private readonly freemarkerSettings: Record<string, string>

  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private respawnCount = 0
  private fatalCrash = false
  private shuttingDown = false
  private inFlight: Pending | null = null
  private queue: Pending[] = []
  private closeWatchers: Array<() => void> = []

  constructor(opts: DaemonOptions) {
    this.templatesRoot = resolve(opts.templatesRoot)
    this.javaScriptPath = opts.javaScriptPath ?? defaultJavaScriptPath()
    this.missingMode = opts.previewMissingAs ?? 'error'
    this.freemarkerSettings = opts.freemarkerSettings ?? {}
  }

  render(req: DaemonRenderRequest): Promise<RenderResult> {
    if (this.shuttingDown) {
      return Promise.reject(
        new FreemarkerError({
          type: 'daemon-crash',
          message: 'daemon is shutting down',
          templatePath: req.templateName,
        }),
      )
    }
    if (this.fatalCrash) {
      return Promise.reject(this.fatalCrashError(req.templateName))
    }

    return new Promise<RenderResult>((resolveP, rejectP) => {
      this.queue.push({
        templateName: req.templateName,
        fixturePath: req.fixturePath,
        templatePath: resolve(this.templatesRoot, req.templateName),
        resolve: resolveP,
        reject: rejectP,
      })
      this.pump()
    })
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    const proc = this.proc
    this.proc = null
    if (!proc || proc.exitCode !== null) return
    await new Promise<void>((res) => {
      proc.once('close', () => res())
      try {
        proc.stdin.end()
      } catch {
        /* ignore */
      }
      proc.kill()
    })
  }

  /** Test-only: PID of the underlying Java process, if running. */
  get pid(): number | undefined {
    return this.proc?.pid
  }

  /** Test-only: resolves the next time the underlying process closes. */
  waitForClose(): Promise<void> {
    return new Promise((res) => this.closeWatchers.push(res))
  }

  private pump(): void {
    if (this.fatalCrash) {
      this.failAll(this.fatalCrashError())
      return
    }
    if (this.inFlight) return
    const next = this.queue.shift()
    if (!next) return

    const proc = this.ensureProc()
    if (!proc) {
      next.reject(this.fatalCrashError(next.templatePath))
      return
    }

    this.inFlight = next
    // Protocol is strictly serial request/response: one render in flight,
    // responses correspond to the head of the queue. No id correlation field —
    // adding one back is the right move only when the daemon actually accepts
    // N in-flight renders (a v2 concern when a VS Code extension opens
    // multiple webviews simultaneously).
    const request = JSON.stringify({
      templateName: next.templateName,
      fixturePath: next.fixturePath,
    })
    proc.stdin.write(request + '\n')
  }

  private ensureProc(): ChildProcessWithoutNullStreams | null {
    if (this.proc && this.proc.exitCode === null) return this.proc

    const childEnv: NodeJS.ProcessEnv = { ...process.env }
    if (Object.keys(this.freemarkerSettings).length > 0) {
      childEnv.FMP_FREEMARKER_SETTINGS = JSON.stringify(this.freemarkerSettings)
    }

    const proc = spawn(
      'jbang',
      [
        this.javaScriptPath,
        '--daemon',
        this.templatesRoot,
        this.missingMode,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv },
    )

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    proc.stderr.on('data', (chunk: string) => {
      debugLog(`[daemon stderr] ${chunk}`)
    })
    proc.on('close', (code, signal) => this.onClose(code, signal))
    proc.on('error', (err) => {
      debugLog(`[daemon spawn error] ${err.message}`)
    })

    this.proc = proc
    return proc
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let nl: number
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let env: ResponseEnvelope
    try {
      env = JSON.parse(line) as ResponseEnvelope
    } catch {
      debugLog(`[daemon unparseable line] ${line.slice(0, 200)}`)
      return
    }

    const pending = this.inFlight
    if (!pending) {
      debugLog(`[daemon orphan response] ${line.slice(0, 200)}`)
      return
    }
    this.inFlight = null

    if (env.ok && env.html !== undefined) {
      pending.resolve({ html: env.html })
    } else if (!env.ok && env.error) {
      if (env.error.stack) {
        debugLog(
          `daemon render failed (${env.error.type}) for ${env.error.templatePath}\n${env.error.stack}`,
        )
      }
      pending.reject(new FreemarkerError(env.error))
    } else {
      pending.reject(
        new FreemarkerError({
          type: 'internal',
          message: 'malformed envelope from daemon',
          templatePath: pending.templatePath,
        }),
      )
    }

    setImmediate(() => this.pump())
  }

  private onClose(_code: number | null, _signal: NodeJS.Signals | null): void {
    const wasInFlight = this.inFlight
    this.inFlight = null
    this.proc = null

    const watchers = this.closeWatchers
    this.closeWatchers = []
    for (const w of watchers) w()

    if (this.shuttingDown) return

    this.respawnCount++

    if (this.respawnCount > MAX_RESPAWNS) {
      this.fatalCrash = true
      const err = this.fatalCrashError(wasInFlight?.templatePath)
      if (wasInFlight) wasInFlight.reject(err)
      this.failAll(err)
      return
    }

    if (wasInFlight) {
      this.queue.unshift(wasInFlight)
    }
    setImmediate(() => this.pump())
  }

  private fatalCrashError(templatePath?: string): FreemarkerError {
    return new FreemarkerError({
      type: 'daemon-crash',
      message: 'JBang daemon crashed twice in a row',
      templatePath: templatePath ?? '',
    })
  }

  private failAll(err: FreemarkerError): void {
    const queued = this.queue
    this.queue = []
    for (const p of queued) p.reject(err)
  }
}
