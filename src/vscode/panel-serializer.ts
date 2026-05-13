import * as vscode from 'vscode'
import type { PreviewPanelManager } from './preview-panel.ts'

export function createPanelSerializer(manager: PreviewPanelManager): vscode.WebviewPanelSerializer {
  return {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
      await manager.restoreFromState(panel, state)
    },
  }
}
