import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { registerSaveWatcher } from './save-watcher.ts'
import type { PreviewPanelManager } from './preview-panel.ts'

function fakeContext() {
  return { subscriptions: [] as { dispose: () => unknown }[] } as unknown as vscode.ExtensionContext
}

function fakeManager(activeUri: vscode.Uri | null): PreviewPanelManager & {
  refresh: ReturnType<typeof vi.fn>
} {
  return {
    activeUri,
    refresh: vi.fn(async () => {}),
  } as unknown as PreviewPanelManager & { refresh: ReturnType<typeof vi.fn> }
}

function getSaveHandler(): (doc: { uri: vscode.Uri }) => unknown {
  const calls = (vscode.workspace.onDidSaveTextDocument as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const last = calls[calls.length - 1] as [(doc: { uri: vscode.Uri }) => unknown]
  return last[0]
}

describe('registerSaveWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('saving the active template URI triggers manager.refresh', () => {
    const activeUri = vscode.Uri.file('/tmp/t/welcome.ftlh')
    const manager = fakeManager(activeUri)
    registerSaveWatcher(fakeContext(), manager)

    getSaveHandler()({ uri: activeUri })

    expect(manager.refresh).toHaveBeenCalledTimes(1)
  })

  test('saving a different template URI does not trigger refresh', () => {
    const manager = fakeManager(vscode.Uri.file('/tmp/t/a.ftlh'))
    registerSaveWatcher(fakeContext(), manager)

    getSaveHandler()({ uri: vscode.Uri.file('/tmp/t/b.ftlh') })

    expect(manager.refresh).not.toHaveBeenCalled()
  })

  test('saving anything when no active template does not trigger refresh', () => {
    const manager = fakeManager(null)
    registerSaveWatcher(fakeContext(), manager)

    getSaveHandler()({ uri: vscode.Uri.file('/tmp/t/welcome.ftlh') })

    expect(manager.refresh).not.toHaveBeenCalled()
  })

  test('pushes the listener disposable into context.subscriptions', () => {
    const context = fakeContext()
    registerSaveWatcher(context, fakeManager(null))

    expect(context.subscriptions.length).toBeGreaterThan(0)
  })
})
