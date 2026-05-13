import * as vscode from 'vscode'
import { prereqsOkOrWarn } from './prereqs-check.ts'
import type { PreviewPanelManager } from './preview-panel.ts'

export interface CommandDeps {
  manager: PreviewPanelManager
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { manager } = deps

  context.subscriptions.push(
    vscode.commands.registerCommand('freemarker.preview', (uri?: vscode.Uri) => {
      if (!prereqsOkOrWarn()) return
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        vscode.window.showErrorMessage(
          'FreeMarker: Preview Template needs a .ftlh/.ftl file. Open one in the editor or right-click a template in the Explorer.',
        )
        return
      }
      void manager.preview(target)
    }),
    vscode.commands.registerCommand('freemarker.refresh', () => {
      void manager.refresh()
    }),
    vscode.commands.registerCommand('freemarker.stop', () => {
      void manager.shutdownPool()
    }),
  )
}
