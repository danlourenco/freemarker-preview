import * as vscode from 'vscode'
import { basename, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { materializeFixture } from '../core/fixtures.ts'
import { inlineCss as defaultInlineCss } from '../core/inline.ts'
import type { DaemonOptions } from '../core/daemon.ts'
import type { RegistryProjectEntry } from '../core/registry.ts'
import type { DaemonHandle, DaemonPool } from './daemon-pool.ts'
import type { RenderState } from './status-bar.ts'

export const PREVIEW_PANEL_VIEW_TYPE = 'freemarkerPreview'

export interface PreviewPanelDeps {
  /**
   * Either an already-built pool (for tests / explicit ownership) or a
   * factory the manager calls lazily once it knows the project's
   * templatesRoot. Use the factory in production: the daemon's
   * templatesRoot must come from the resolved registry entry, not
   * guessed at activation time.
   */
  pool?: DaemonPool
  poolFactory?: (opts: DaemonOptions) => DaemonPool
  resolveProject: (uri: vscode.Uri) => RegistryProjectEntry | null
  extensionUri?: vscode.Uri
  inlineCss?: (html: string) => string
  fixtureDir?: string
  /** Forwarded into DaemonOptions when the pool is created lazily. */
  daemonOptionsExtra?: Omit<DaemonOptions, 'templatesRoot'>
}

interface ActiveTemplate {
  uri: vscode.Uri
  templatesRoot: string
  templateName: string
  fixture: Record<string, unknown> | null
}

export interface WebviewAssetUris {
  cspSource: string
  daisyuiCss: string
  shellCss: string
  shellJs: string
}

export function buildWebviewHtml(uris: WebviewAssetUris): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${uris.cspSource} 'unsafe-inline'`,
    `script-src ${uris.cspSource}`,
    `img-src ${uris.cspSource} data:`,
    `frame-src ${uris.cspSource} data:`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>FreeMarker Preview</title>
<link rel="stylesheet" href="${uris.daisyuiCss}">
<link rel="stylesheet" href="${uris.shellCss}">
</head>
<body>
<header class="shell-header">
  <div class="shell-controls">
    <div class="width-controls" role="group" aria-label="preview width">
      <button type="button" class="width-btn" data-width="375" title="Mobile (375px)">375</button>
      <button type="button" class="width-btn" data-width="600" title="Desktop (600px)">600</button>
      <button type="button" class="width-btn" data-width="full" title="Full container width">Full</button>
      <input type="number" class="width-custom" id="width-custom" min="200" max="2000" placeholder="px" aria-label="custom width">
    </div>
  </div>
</header>
<main class="shell-main">
  <div class="iframe-wrap" id="iframe-wrap" data-mode="phone">
    <div class="preview-phone">
      <div class="mockup-phone">
        <div class="mockup-phone-camera"></div>
        <div class="mockup-phone-display" id="phone-display">
          <div class="mail-chrome" id="mail-chrome">
            <div class="mc-statusbar">
              <span class="mc-time">9:41</span>
              <span class="mc-status-icons" aria-hidden="true">
                <svg class="mc-icon" width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="0.5"/><rect x="4.5" y="5" width="3" height="6" rx="0.5"/><rect x="9" y="3" width="3" height="8" rx="0.5"/><rect x="13.5" y="0" width="3" height="11" rx="0.5"/></svg>
                <svg class="mc-icon" width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 1.5C4.7 1.5 2.1 2.4 0 4l1.5 1.7C3.2 4.4 5.3 3.7 7.5 3.7s4.3 0.7 6 1.9L15 4C12.9 2.4 10.3 1.5 7.5 1.5zM7.5 5.5c-1.7 0-3.3 0.5-4.6 1.5l1.5 1.7C5.3 8.1 6.4 7.7 7.5 7.7s2.2 0.4 3 1l1.6-1.7C10.8 6 9.2 5.5 7.5 5.5zM7.5 9c-0.9 0-1.7 0.3-2.3 0.9L7.5 11l2.3-1.1C9.2 9.3 8.4 9 7.5 9z"/></svg>
                <span class="mc-battery"><span class="mc-battery-level"></span></span>
              </span>
            </div>
            <div class="mc-navbar">
              <button class="mc-nav-btn mc-back" type="button" aria-label="back">
                <svg width="11" height="18" viewBox="0 0 11 18"><path d="M9.5 1L1.5 9l8 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <span class="mc-nav-arrows">
                <span class="mc-nav-btn"><svg width="14" height="9" viewBox="0 0 14 9"><path d="M1 7.5L7 1.5l6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                <span class="mc-nav-btn"><svg width="14" height="9" viewBox="0 0 14 9"><path d="M1 1.5l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              </span>
            </div>
            <div class="mc-meta">
              <span class="mc-message-count">1 Message</span>
              <span class="mc-summarize">Summarize</span>
            </div>
            <div class="mc-sender-row">
              <div class="mc-sender-avatar" aria-hidden="true"></div>
              <div class="mc-sender-info">
                <div class="mc-sender-line">
                  <span class="mc-sender-name" id="mc-sender-name">Sender Name</span>
                  <span class="mc-sender-date" id="mc-sender-date">Today</span>
                </div>
                <div class="mc-recipient">To: <span class="mc-recipient-name">You</span></div>
              </div>
            </div>
            <div class="mc-subject" id="mc-subject">Email Subject</div>
          </div>
          <div class="phone-iframe-container" id="phone-iframe-container">
            <iframe id="preview" title="email preview"></iframe>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-plain" id="preview-plain"></div>
  </div>
</main>
<script src="${uris.shellJs}"></script>
</body>
</html>`
}

function resolveAssetUris(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): WebviewAssetUris {
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'vscode', 'webview')
  return {
    cspSource: panel.webview.cspSource,
    daisyuiCss: panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'daisyui.css')).toString(),
    shellCss: panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'shell.css')).toString(),
    shellJs: panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'shell.js')).toString(),
  }
}

export class PreviewPanelManager {
  private readonly explicitPool: DaemonPool | null
  private readonly poolFactory: ((opts: DaemonOptions) => DaemonPool) | null
  private readonly daemonOptionsExtra: Omit<DaemonOptions, 'templatesRoot'>
  private readonly resolveProject: (uri: vscode.Uri) => RegistryProjectEntry | null
  private readonly inlineCss: (html: string) => string
  private readonly fixtureDir: string
  private readonly extensionUri: vscode.Uri | null

  private pool: DaemonPool | null = null
  private poolTemplatesRoot: string | null = null
  private panel: vscode.WebviewPanel | null = null
  private daemonHandle: DaemonHandle | null = null
  private active: ActiveTemplate | null = null
  private readonly _onStateChange = new vscode.EventEmitter<RenderState>()
  readonly onDidChangeRenderState: vscode.Event<RenderState> = this._onStateChange.event

  constructor(deps: PreviewPanelDeps) {
    this.explicitPool = deps.pool ?? null
    this.poolFactory = deps.poolFactory ?? null
    this.daemonOptionsExtra = deps.daemonOptionsExtra ?? {}
    if (!this.explicitPool && !this.poolFactory) {
      throw new Error('PreviewPanelManager: either `pool` or `poolFactory` is required')
    }
    this.resolveProject = deps.resolveProject
    this.inlineCss = deps.inlineCss ?? defaultInlineCss
    this.fixtureDir = deps.fixtureDir ?? tmpdir()
    this.extensionUri = deps.extensionUri ?? null
    if (this.explicitPool) this.pool = this.explicitPool
  }

  /** For freemarker.stop. Shuts down whichever pool is live (factory or explicit). */
  async shutdownPool(): Promise<void> {
    const pool = this.pool
    this.pool = this.explicitPool // restore explicit pool reference if any (factory mode → null)
    this.poolTemplatesRoot = null
    this.daemonHandle?.release()
    this.daemonHandle = null
    if (pool) await pool.shutdown()
  }

  private ensurePoolFor(templatesRoot: string): DaemonPool {
    if (this.explicitPool) return this.explicitPool
    if (this.pool && this.poolTemplatesRoot === templatesRoot) return this.pool
    if (this.pool && this.poolTemplatesRoot !== templatesRoot) {
      // Project's templatesRoot changed — drop the old pool.
      void this.pool.shutdown()
      this.pool = null
      this.daemonHandle?.release()
      this.daemonHandle = null
    }
    if (!this.poolFactory) throw new Error('no pool factory configured')
    this.pool = this.poolFactory({ templatesRoot, ...this.daemonOptionsExtra })
    this.poolTemplatesRoot = templatesRoot
    return this.pool
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

    this.ensurePoolFor(project.templatesRoot)

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

    const localResourceRoots = this.extensionUri
      ? [vscode.Uri.joinPath(this.extensionUri, 'dist', 'vscode', 'webview')]
      : undefined
    const panel = vscode.window.createWebviewPanel(
      PREVIEW_PANEL_VIEW_TYPE,
      `Preview: ${basename(uri.fsPath)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots },
    )
    const uris = this.extensionUri
      ? resolveAssetUris(panel, this.extensionUri)
      : {
          cspSource: panel.webview.cspSource,
          daisyuiCss: '',
          shellCss: '',
          shellJs: '',
        }
    panel.webview.html = buildWebviewHtml(uris)
    if (!this.pool) throw new Error('pool not initialized — preview() must run first')
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

    this._onStateChange.fire('rendering')
    try {
      const result = await this.daemonHandle.daemon.render({
        templateName: this.active.templateName,
        fixturePath,
      })
      const html = this.inlineCss(result.html)
      await this.panel.webview.postMessage({ type: 'render', html })
      this._onStateChange.fire('idle')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`FreeMarker render failed: ${message}`)
      this._onStateChange.fire('error')
    }
  }
}
