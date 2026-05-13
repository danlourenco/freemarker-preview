import * as vscode from 'vscode'
import { registerPreviewCommand } from './commands.ts'

export function activate(context: vscode.ExtensionContext): void {
  registerPreviewCommand(context)
}

export function deactivate(): void {}
