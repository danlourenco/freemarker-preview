import * as vscode from 'vscode'
import { openPreviewPanel } from './preview-panel.ts'
import { prereqsOkOrWarn } from './prereqs-check.ts'

export function registerPreviewCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('freemarker.preview', (uri: vscode.Uri) => {
    if (!prereqsOkOrWarn()) return
    openPreviewPanel(uri)
  })
  context.subscriptions.push(disposable)
}
