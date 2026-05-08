import { EventEmitter } from 'node:events'
import { watch, type FSWatcher } from 'chokidar'

export interface WatcherOptions {
  /** Directories whose contents should be watched. */
  roots: string[]
  /** Glob patterns under roots to include. Defaults to .ftlh, .ftl, .json. */
  include?: string[]
  /** Debounce window in ms. Defaults to 50. */
  debounceMs?: number
}

export interface ChangePayload {
  path: string
}

const DEFAULT_INCLUDE = ['**/*.ftlh', '**/*.ftl', '**/*.json']
const DEFAULT_DEBOUNCE_MS = 50

export class Watcher extends EventEmitter {
  private fsWatcher: FSWatcher | null = null
  private readonly roots: string[]
  private readonly include: string[]
  private readonly debounceMs: number
  private timer: NodeJS.Timeout | null = null
  private pending: Set<string> = new Set()

  constructor(opts: WatcherOptions) {
    super()
    this.roots = opts.roots
    this.include = opts.include ?? DEFAULT_INCLUDE
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
  }

  async start(): Promise<void> {
    this.fsWatcher = watch(this.roots, {
      ignoreInitial: true,
      ignored: (path: string) => {
        if (path === '' || this.roots.includes(path)) return false
        return !this.include.some((pat) => match(path, pat))
      },
    })

    this.fsWatcher.on('add', (p) => this.queue(p))
    this.fsWatcher.on('change', (p) => this.queue(p))
    this.fsWatcher.on('unlink', (p) => this.queue(p))

    await new Promise<void>((res) => {
      this.fsWatcher?.once('ready', () => res())
    })
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    await this.fsWatcher?.close()
    this.fsWatcher = null
  }

  private queue(path: string): void {
    this.pending.add(path)
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      const paths = Array.from(this.pending)
      this.pending.clear()
      this.emit('change', { paths })
    }, this.debounceMs)
  }
}

function match(path: string, pattern: string): boolean {
  // Tiny glob matcher: supports **, *, and literal segments. Sufficient for
  // the patterns we use (*.ftlh, *.ftl, *.json under any depth).
  const re = new RegExp(
    '^' +
      pattern
        .split('**')
        .map((seg) =>
          seg
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*'),
        )
        .join('.*') +
      '$',
  )
  return re.test(path)
}
