import { describe, test, expect, beforeEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import * as vscode from 'vscode'
import {
  PreviewPanelManager,
  buildWebviewHtml,
  type PreviewPanelDeps,
} from './preview-panel.ts'
import { DaemonPool, type RenderDaemonLike } from './daemon-pool.ts'
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
  const daemon = fakeDaemon()
  const project: RegistryProjectEntry = { templatesRoot: '/tmp/t' }
  return {
    pool: new DaemonPool({ templatesRoot: project.templatesRoot }, () => daemon),
    resolveProject: vi.fn(() => project),
    inlineCss: (html: string) => `INLINED:${html}`,
    fixtureDir: tmpdir(),
    ...overrides,
  }
}

describe('buildWebviewHtml', () => {
  const uris = {
    cspSource: 'vscode-webview://abc123',
    daisyuiCss: 'vscode-webview://abc123/webview/daisyui.css',
    shellCss: 'vscode-webview://abc123/webview/shell.css',
    shellJs: 'vscode-webview://abc123/webview/shell.js',
  }

  test('emits a CSP meta tag derived from webview.cspSource', () => {
    const html = buildWebviewHtml(uris)

    expect(html).toMatch(/<meta\s+http-equiv=["']Content-Security-Policy["']/i)
    expect(html).toContain('vscode-webview://abc123')
  })

  test('loads daisyui, shell.css, and shell.js via the supplied webview URIs', () => {
    const html = buildWebviewHtml(uris)

    expect(html).toContain(`href="${uris.daisyuiCss}"`)
    expect(html).toContain(`href="${uris.shellCss}"`)
    expect(html).toContain(`src="${uris.shellJs}"`)
  })

  test('includes the mockup-phone chrome and width-toggle controls', () => {
    const html = buildWebviewHtml(uris)

    expect(html).toContain('mockup-phone')
    expect(html).toContain('mc-subject')
    expect(html).toContain('width-controls')
    expect(html).toMatch(/data-width="375"/)
    expect(html).toMatch(/data-width="600"/)
    expect(html).toMatch(/data-width="full"/)
  })
})

describe('PreviewPanelManager.preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('happy path: renders, inlines, and posts {type:render, html} to the webview', async () => {
    const daemon = fakeDaemon('<p>raw</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const deps = buildDeps({
      pool,
      resolveProject: () => ({ templatesRoot: '/tmp/t', fixture: { user: 'world' } }),
    })
    const manager = new PreviewPanelManager(deps)

    await manager.preview(vscode.Uri.file('/tmp/t/welcome.ftlh'))

    expect(daemon.render).toHaveBeenCalledWith({
      templateName: 'welcome.ftlh',
      fixturePath: expect.any(String),
    })

    const panel = (vscode.window.createWebviewPanel as unknown as {
      mock: { results: { value: { webview: { postMessage: ReturnType<typeof vi.fn> } } }[] }
    }).mock.results[0].value
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'render',
      html: 'INLINED:<p>raw</p>',
    })
  })

  test('previewing a second template reuses the single shared panel', async () => {
    const daemon = fakeDaemon('<p>raw</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))

    await manager.preview(vscode.Uri.file('/tmp/t/a.ftlh'))
    await manager.preview(vscode.Uri.file('/tmp/t/b.ftlh'))

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1)
    expect(daemon.render).toHaveBeenCalledTimes(2)
    expect(daemon.render).toHaveBeenNthCalledWith(2, expect.objectContaining({ templateName: 'b.ftlh' }))
  })

  test('fixtureless project renders against {} (no error thrown)', async () => {
    const daemon = fakeDaemon('<p>x</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(
      buildDeps({
        pool,
        resolveProject: () => ({ templatesRoot: '/tmp/t' }),
      }),
    )

    await expect(manager.preview(vscode.Uri.file('/tmp/t/a.ftlh'))).resolves.toBeUndefined()
    expect(daemon.render).toHaveBeenCalledTimes(1)
  })

  test('render error → showErrorMessage, panel survives, refresh attempt allowed', async () => {
    const daemon: RenderDaemonLike & { render: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> } = {
      render: vi.fn().mockRejectedValueOnce(new Error('parse fail')).mockResolvedValueOnce({ html: '<p>recovered</p>' }),
      shutdown: vi.fn(async () => {}),
    }
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))

    await manager.preview(vscode.Uri.file('/tmp/t/a.ftlh'))

    expect(vscode.window.showErrorMessage).toHaveBeenCalled()
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1)

    await manager.refresh()
    expect(daemon.render).toHaveBeenCalledTimes(2)
  })

  test('refresh re-renders the currently-displayed template', async () => {
    const daemon = fakeDaemon('<p>x</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))

    await manager.preview(vscode.Uri.file('/tmp/t/welcome.ftlh'))
    await manager.refresh()

    expect(daemon.render).toHaveBeenCalledTimes(2)
    expect(daemon.render).toHaveBeenNthCalledWith(2, expect.objectContaining({ templateName: 'welcome.ftlh' }))
  })

  test('emits rendering → idle on a successful preview', async () => {
    const daemon = fakeDaemon('<p>x</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))
    const states: string[] = []
    manager.onDidChangeRenderState((s) => states.push(s))

    await manager.preview(vscode.Uri.file('/tmp/t/a.ftlh'))

    expect(states).toEqual(['rendering', 'idle'])
  })

  test('emits rendering → error when the daemon rejects', async () => {
    const daemon = {
      render: vi.fn().mockRejectedValue(new Error('boom')),
      shutdown: vi.fn(async () => {}),
    }
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))
    const states: string[] = []
    manager.onDidChangeRenderState((s) => states.push(s))

    await manager.preview(vscode.Uri.file('/tmp/t/a.ftlh'))

    expect(states).toEqual(['rendering', 'error'])
  })

  test('disposing the panel releases the daemon ref so pool can shut down', async () => {
    const daemon = fakeDaemon('<p>x</p>')
    const pool = new DaemonPool({ templatesRoot: '/tmp/t' }, () => daemon)
    const manager = new PreviewPanelManager(buildDeps({ pool }))

    await manager.preview(vscode.Uri.file('/tmp/t/welcome.ftlh'))
    const panel = (vscode.window.createWebviewPanel as unknown as {
      mock: { results: { value: { onDidDispose: ReturnType<typeof vi.fn> } }[] }
    }).mock.results[0].value
    const disposeHandler = (panel.onDidDispose as ReturnType<typeof vi.fn>).mock.calls[0][0] as () => void
    disposeHandler()
    await Promise.resolve()

    expect(daemon.shutdown).toHaveBeenCalledTimes(1)
  })
})
