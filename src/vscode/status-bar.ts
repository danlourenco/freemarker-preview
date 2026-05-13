import * as vscode from 'vscode'

export type RenderState = 'rendering' | 'idle' | 'error'

export interface RenderStateSource {
  onDidChangeRenderState: vscode.Event<RenderState>
}

const TEXT: Record<RenderState, string> = {
  rendering: '$(sync~spin) FreeMarker rendering…',
  idle: '$(check) FreeMarker',
  error: '$(error) FreeMarker error',
}

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem
  private readonly subscription: vscode.Disposable
  private disposed = false

  constructor(source: RenderStateSource) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.item.command = 'freemarker.refresh'
    this.subscription = source.onDidChangeRenderState((state) => this.apply(state))
  }

  private apply(state: RenderState): void {
    if (this.disposed) return
    this.item.text = TEXT[state]
    this.item.backgroundColor =
      state === 'error' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined
    this.item.show()
  }

  dispose(): void {
    this.disposed = true
    this.subscription.dispose()
    this.item.dispose()
  }
}
