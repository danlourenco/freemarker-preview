import * as vscode from 'vscode'
import { FreemarkerError } from '../core/errors.ts'
import { formatError } from '../core/format-error.ts'

export class DiagnosticsManager {
  private readonly collection: vscode.DiagnosticCollection

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('freemarker')
  }

  surface(uri: vscode.Uri, error: FreemarkerError): void {
    const line = Math.max(0, (error.line ?? 1) - 1)
    const column = Math.max(0, (error.column ?? 1) - 1)
    const range = new vscode.Range(
      new vscode.Position(line, column),
      new vscode.Position(line, column + 1),
    )
    const message = formatError(error, undefined, { colors: false })
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
    diag.source = 'freemarker'
    diag.code = error.type
    this.collection.set(uri, [diag])
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri)
  }

  dispose(): void {
    this.collection.dispose()
  }
}
