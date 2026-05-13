import * as vscode from 'vscode'
import type { PreviewPanelManager } from './preview-panel.ts'

export function registerSaveWatcher(
  context: vscode.ExtensionContext,
  manager: PreviewPanelManager,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const active = manager.activeUri
      if (!active) return
      if (doc.uri.fsPath !== active.fsPath) return
      void manager.refresh()
    }),
  )
}
