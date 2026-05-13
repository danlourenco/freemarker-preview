import * as vscode from 'vscode'
import { basename, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { materializeFixture } from '../core/fixtures.ts'
import { inlineCss as defaultInlineCss } from '../core/inline.ts'
import type { RegistryProjectEntry } from '../core/registry.ts'
import type { DaemonHandle, DaemonPool } from './daemon-pool.ts'

export const PREVIEW_PANEL_VIEW_TYPE = 'freemarkerPreview'

export interface PreviewPanelDeps {
  pool: DaemonPool
  resolveProject: (uri: vscode.Uri) => RegistryProjectEntry | null
  inlineCss?: (html: string) => string
  fixtureDir?: string
}

interface ActiveTemplate {
  uri: vscode.Uri
  templatesRoot: string
  templateName: string
  fixture: Record<string, unknown> | null
}

export function buildWebviewHtml(webview: { cspSource: string }): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} data:`,
    `frame-src ${webview.cspSource} data:`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>FreeMarker Preview</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; }
      iframe { width: 100%; height: 100vh; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="preview" srcdoc="<p style='font-family:sans-serif;color:#666;padding:1rem'>Rendering…</p>"></iframe>
    <script>
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg && msg.type === 'render' && typeof msg.html === 'string') {
          document.getElementById('preview').srcdoc = msg.html;
        }
      });
    </script>
  </body>
</html>`
}

export class PreviewPanelManager {
  private readonly pool: DaemonPool
  private readonly resolveProject: (uri: vscode.Uri) => RegistryProjectEntry | null
  private readonly inlineCss: (html: string) => string
  private readonly fixtureDir: string

  private panel: vscode.WebviewPanel | null = null
  private daemonHandle: DaemonHandle | null = null
  private active: ActiveTemplate | null = null

  constructor(deps: PreviewPanelDeps) {
    this.pool = deps.pool
    this.resolveProject = deps.resolveProject
    this.inlineCss = deps.inlineCss ?? defaultInlineCss
    this.fixtureDir = deps.fixtureDir ?? tmpdir()
  }

  get activeUri(): vscode.Uri | null {
    return this.active?.uri ?? null
  }

  async preview(uri: vscode.Uri): Promise<void> {
    const project = this.resolveProject(uri)
    if (!project) {
      vscode.window.showErrorMessage(
        `No freemarker-preview project registered for ${uri.fsPath}. Run \`freemarker-preview init\` in the project root.`,
      )
      return
    }

    const templateName = relative(project.templatesRoot, uri.fsPath)
    this.active = {
      uri,
      templatesRoot: project.templatesRoot,
      templateName,
      fixture: project.fixture ?? null,
    }

    this.ensurePanel(uri)
    await this.renderActive()
  }

  async refresh(): Promise<void> {
    if (!this.active) return
    await this.renderActive()
  }

  private ensurePanel(uri: vscode.Uri): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.title = `Preview: ${basename(uri.fsPath)}`
      this.panel.reveal(vscode.ViewColumn.Beside, true)
      return this.panel
    }

    const panel = vscode.window.createWebviewPanel(
      PREVIEW_PANEL_VIEW_TYPE,
      `Preview: ${basename(uri.fsPath)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    )
    panel.webview.html = buildWebviewHtml(panel.webview)
    this.daemonHandle = this.pool.acquire()
    panel.onDidDispose(() => {
      this.panel = null
      this.active = null
      this.daemonHandle?.release()
      this.daemonHandle = null
    })
    this.panel = panel
    return panel
  }

  private async renderActive(): Promise<void> {
    if (!this.panel || !this.active || !this.daemonHandle) return

    const fixturePath = join(this.fixtureDir, `freemarker-preview-fixture-${process.pid}.json`)
    materializeFixture(this.active.fixture, fixturePath)

    try {
      const result = await this.daemonHandle.daemon.render({
        templateName: this.active.templateName,
        fixturePath,
      })
      const html = this.inlineCss(result.html)
      await this.panel.webview.postMessage({ type: 'render', html })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`FreeMarker render failed: ${message}`)
    }
  }
}
