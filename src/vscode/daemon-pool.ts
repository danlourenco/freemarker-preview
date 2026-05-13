import { RenderDaemon, type DaemonOptions, type DaemonRenderRequest } from '../core/daemon.ts'
import type { RenderResult } from '../core/render.ts'

export interface RenderDaemonLike {
  render(req: DaemonRenderRequest): Promise<RenderResult>
  shutdown(): Promise<void>
}

export type DaemonFactory = (opts: DaemonOptions) => RenderDaemonLike

export interface DaemonHandle {
  readonly daemon: RenderDaemonLike
  release(): void
}

export class DaemonPool {
  private current: RenderDaemonLike | null = null
  private refCount = 0

  constructor(
    private readonly opts: DaemonOptions,
    private readonly factory: DaemonFactory = (o) => new RenderDaemon(o),
  ) {}

  acquire(): DaemonHandle {
    if (!this.current) this.current = this.factory(this.opts)
    this.refCount++
    const daemon = this.current
    let released = false
    return {
      daemon,
      release: () => {
        if (released) return
        released = true
        this.refCount--
        if (this.refCount === 0) void this.shutdown()
      },
    }
  }

  async shutdown(): Promise<void> {
    const d = this.current
    this.current = null
    this.refCount = 0
    if (d) await d.shutdown()
  }
}
