import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FreemarkerError, type StructuredError } from './errors.ts'
import { debugLog } from './debug-log.ts'
import type { RenderResult } from './render.ts'

export interface DaemonOptions {
  templatesRoot: string
  javaScriptPath?: string
}

export interface DaemonRenderRequest {
  templateName: string
  fixturePath: string
}

const DEFAULT_JAVA_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'java',
  'Render.java',
)

interface ResponseEnvelope {
  id?: string
  ok: boolean
  html?: string
  error?: StructuredError
}

interface Pending {
  id: string
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

  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private idCounter = 0
  private respawnCount = 0
  private fatalCrash = false
  private shuttingDown = false
  private inFlight: Pending | null = null
  private queue: Pending[] = []
  private closeWatchers: Array<() => void> = []

  constructor(opts: DaemonOptions) {
    this.templatesRoot = resolve(opts.templatesRoot)
    this.javaScriptPath = opts.javaScriptPath ?? DEFAULT_JAVA_SCRIPT_PATH
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

    const id = String(++this.idCounter)
    return new Promise<RenderResult>((resolveP, rejectP) => {
      this.queue.push({
        id,
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
    const request = JSON.stringify({
      id: next.id,
      templateName: next.templateName,
      fixturePath: next.fixturePath,
    })
    proc.stdin.write(request + '\n')
  }

  private ensureProc(): ChildProcessWithoutNullStreams | null {
    if (this.proc && this.proc.exitCode === null) return this.proc

    const proc = spawn(
      'jbang',
      [this.javaScriptPath, '--daemon', this.templatesRoot],
      { stdio: ['pipe', 'pipe', 'pipe'] },
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
