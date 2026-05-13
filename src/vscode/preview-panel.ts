import * as vscode from 'vscode'
import { basename } from 'node:path'

export const PREVIEW_PANEL_VIEW_TYPE = 'freemarkerPreview'

export function buildWebviewHtml(webview: { cspSource: string }): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `frame-src ${webview.cspSource} data:`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>FreeMarker Preview</title>
  </head>
  <body>
    <p>Preview surface coming soon.</p>
  </body>
</html>`
}

export function openPreviewPanel(uri: vscode.Uri): vscode.WebviewPanel {
  const title = `Preview: ${basename(uri.fsPath)}`
  const panel = vscode.window.createWebviewPanel(
    PREVIEW_PANEL_VIEW_TYPE,
    title,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  )
  panel.webview.html = buildWebviewHtml(panel.webview)
  return panel
}
