import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { registerPreviewCommand } from './commands.ts'
import { prereqsOkOrWarn } from './prereqs-check.ts'

vi.mock('./prereqs-check.ts', () => ({ prereqsOkOrWarn: vi.fn(() => true) }))

function fakeContext() {
  return { subscriptions: [] as { dispose: () => unknown }[] } as unknown as vscode.ExtensionContext
}

function getRegisteredHandler(): (uri: vscode.Uri) => unknown {
  const calls = (vscode.commands.registerCommand as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const last = calls[calls.length - 1] as [string, (uri: vscode.Uri) => unknown]
  return last[1]
}

describe('registerPreviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('registers freemarker.preview with the VS Code command registry', () => {
    const context = fakeContext()

    registerPreviewCommand(context)

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'freemarker.preview',
      expect.any(Function),
    )
    expect(context.subscriptions).toHaveLength(1)
  })

  test('handler opens a WebviewPanel beside the editor with the template basename in the title', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true)
    registerPreviewCommand(fakeContext())
    const handler = getRegisteredHandler()

    handler(vscode.Uri.file('/tmp/templates/welcome.ftlh'))

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1)
    const [viewType, title, showOptions] = (vscode.window.createWebviewPanel as unknown as {
      mock: { calls: unknown[][] }
    }).mock.calls[0] as [string, string, unknown, unknown]
    expect(viewType).toBe('freemarkerPreview')
    expect(title).toContain('welcome.ftlh')
    expect(showOptions).toBe(vscode.ViewColumn.Beside)
  })

  test('handler short-circuits and does not open a panel when prereqs fail', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false)
    registerPreviewCommand(fakeContext())
    const handler = getRegisteredHandler()

    handler(vscode.Uri.file('/tmp/templates/welcome.ftlh'))

    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled()
  })
})
