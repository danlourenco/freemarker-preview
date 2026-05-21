import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as vscode from 'vscode'
import { PreviewPanelManager, type PreviewPanelDeps } from './preview-panel.ts'
import { DaemonPool, type RenderDaemonLike } from './daemon-pool.ts'
import { createPanelSerializer } from './panel-serializer.ts'
import type { RegistryProjectEntry } from '../core/registry.ts'

function fakeDaemon(html = '<p>ok</p>'): RenderDaemonLike & {
  render: ReturnType<typeof vi.fn>
  shutdown: ReturnType<typeof vi.fn>
} {
  return {
    render: vi.fn(async () => ({ html })),
    shutdown: vi.fn(async () => {}),
  }
}

function buildDeps(overrides: Partial<PreviewPanelDeps> = {}): PreviewPanelDeps {
  const project: RegistryProjectEntry = { templatesRoot: '/tmp/t' }
  return {
    pool: new DaemonPool({ templatesRoot: project.templatesRoot }, () => fakeDaemon()),
    resolveProject: vi.fn(() => project),
    inlineCss: (html: string) => html,
    ...overrides,
  }
}

function fakePanel() {
  return {
    webview: { cspSource: 'vscode-webview://stub', html: '', postMessage: vi.fn() },
    onDidDispose: vi.fn(() => new vscode.Disposable(() => {})),
    reveal: vi.fn(),
    dispose: vi.fn(),
    title: '',
  }
}

describe('PreviewPanelManager.restoreFromState', () => {
  let scratchDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    scratchDir = mkdtempSync(join(tmpdir(), 'fmp-restore-'))
  })

  test('valid state with an existing template re-renders via the daemon', async () => {
    const tplPath = join(scratchDir, 'welcome.ftlh')
    writeFileSync(tplPath, '<p>x</p>')

    const daemon = fakeDaemon('<p>RENDERED</p>')
    const pool = new DaemonPool({ templatesRoot: scratchDir }, () => daemon)
    const manager = new PreviewPanelManager(
      buildDeps({
        pool,
        resolveProject: () => ({ templatesRoot: scratchDir }),
      }),
    )
    const panel = fakePanel()

    await manager.restoreFromState(panel as unknown as vscode.WebviewPanel, {
      templateUriPath: tplPath,
    })

    expect(daemon.render).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'welcome.ftlh' }),
    )
    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'render' }),
    )

    rmSync(scratchDir, { recursive: true, force: true })
  })

  test('missing template file → panel HTML shows a not-found notice, no render', async () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: scratchDir }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))
    const panel = fakePanel()

    await manager.restoreFromState(panel as unknown as vscode.WebviewPanel, {
      templateUriPath: '/nonexistent/path/foo.ftlh',
    })

    expect(daemon.render).not.toHaveBeenCalled()
    expect(panel.webview.html).toMatch(/template/i)
    expect(panel.webview.html).toMatch(/not.{0,5}found/i)

    rmSync(scratchDir, { recursive: true, force: true })
  })

  test('malformed state (missing templateUriPath) → not-found notice, no render', async () => {
    const daemon = fakeDaemon()
    const pool = new DaemonPool({ templatesRoot: scratchDir }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))
    const panel = fakePanel()

    await manager.restoreFromState(panel as unknown as vscode.WebviewPanel, null)

    expect(daemon.render).not.toHaveBeenCalled()
    expect(panel.webview.html).toMatch(/not.{0,5}found/i)

    rmSync(scratchDir, { recursive: true, force: true })
  })
})

describe('createPanelSerializer', () => {
  test('returns a serializer whose deserializeWebviewPanel calls manager.restoreFromState', async () => {
    const manager = {
      restoreFromState: vi.fn(async () => {}),
    } as unknown as PreviewPanelManager
    const serializer = createPanelSerializer(manager)
    const panel = fakePanel() as unknown as vscode.WebviewPanel
    const state = { templateUriPath: '/tmp/t/x.ftlh' }

    await serializer.deserializeWebviewPanel(panel, state)

    expect(manager.restoreFromState).toHaveBeenCalledWith(panel, state)
  })
})
