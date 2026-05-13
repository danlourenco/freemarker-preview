import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { buildWebviewHtml, openPreviewPanel } from './preview-panel.ts'

describe('buildWebviewHtml', () => {
  test('emits a CSP meta tag derived from webview.cspSource', () => {
    const html = buildWebviewHtml({ cspSource: 'vscode-webview://abc123' } as { cspSource: string })

    expect(html).toMatch(/<meta\s+http-equiv=["']Content-Security-Policy["']/i)
    expect(html).toContain('vscode-webview://abc123')
  })
})

describe('openPreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('assigns CSP-bearing HTML to the created panel webview', () => {
    const fakeWebview = { cspSource: 'vscode-webview://xyz', html: '' }
    const fakePanel = { webview: fakeWebview, dispose: vi.fn() }
    ;(vscode.window.createWebviewPanel as unknown as { mockReturnValueOnce: (v: unknown) => void }).mockReturnValueOnce(
      fakePanel,
    )

    openPreviewPanel(vscode.Uri.file('/tmp/templates/welcome.ftlh'))

    expect(fakeWebview.html).toMatch(/<meta\s+http-equiv=["']Content-Security-Policy["']/i)
    expect(fakeWebview.html).toContain('vscode-webview://xyz')
  })
})
