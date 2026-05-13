import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { registerCommands } from './commands.ts'
import { prereqsOkOrWarn } from './prereqs-check.ts'
import type { PreviewPanelManager } from './preview-panel.ts'
import type { DaemonPool } from './daemon-pool.ts'

vi.mock('./prereqs-check.ts', () => ({ prereqsOkOrWarn: vi.fn(() => true) }))

function fakeContext() {
  return { subscriptions: [] as { dispose: () => unknown }[] } as unknown as vscode.ExtensionContext
}

function fakeManager(): PreviewPanelManager & {
  preview: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
} {
  return {
    preview: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  } as unknown as PreviewPanelManager & {
    preview: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }
}

function fakePool(): DaemonPool & { shutdown: ReturnType<typeof vi.fn> } {
  return {
    shutdown: vi.fn(async () => {}),
  } as unknown as DaemonPool & { shutdown: ReturnType<typeof vi.fn> }
}

function getRegisteredHandler(commandId: string): (...args: unknown[]) => unknown {
  const calls = (vscode.commands.registerCommand as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const match = calls.find((c) => c[0] === commandId) as [string, (...args: unknown[]) => unknown] | undefined
  if (!match) throw new Error(`no handler registered for ${commandId}`)
  return match[1]
}

describe('registerCommands — freemarker.preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('registers freemarker.preview with the VS Code command registry', () => {
    const context = fakeContext()

    registerCommands(context, { manager: fakeManager(), pool: fakePool() })

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'freemarker.preview',
      expect.any(Function),
    )
    expect(context.subscriptions.length).toBeGreaterThan(0)
  })

  test('preview handler delegates to manager.preview with the URI', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true)
    const manager = fakeManager()
    registerCommands(fakeContext(), { manager, pool: fakePool() })

    const handler = getRegisteredHandler('freemarker.preview')
    const uri = vscode.Uri.file('/tmp/templates/welcome.ftlh')
    handler(uri)

    expect(manager.preview).toHaveBeenCalledWith(uri)
  })

  test('preview handler short-circuits and does not call manager when prereqs fail', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false)
    const manager = fakeManager()
    registerCommands(fakeContext(), { manager, pool: fakePool() })

    const handler = getRegisteredHandler('freemarker.preview')
    handler(vscode.Uri.file('/tmp/templates/welcome.ftlh'))

    expect(manager.preview).not.toHaveBeenCalled()
  })

  test('preview handler falls back to activeTextEditor URI when invoked without argument (Command Palette)', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true)
    const manager = fakeManager()
    const editorUri = vscode.Uri.file('/tmp/templates/from-palette.ftlh')
    ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
      document: { uri: editorUri },
    }
    registerCommands(fakeContext(), { manager, pool: fakePool() })

    const handler = getRegisteredHandler('freemarker.preview')
    handler() // no argument — Command Palette case

    expect(manager.preview).toHaveBeenCalledWith(editorUri)
    ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined
  })

  test('preview handler shows error when invoked without URI and no active editor', () => {
    ;(prereqsOkOrWarn as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true)
    const manager = fakeManager()
    ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined
    registerCommands(fakeContext(), { manager, pool: fakePool() })

    const handler = getRegisteredHandler('freemarker.preview')
    handler()

    expect(manager.preview).not.toHaveBeenCalled()
    expect(vscode.window.showErrorMessage).toHaveBeenCalled()
  })

  test('refresh command calls manager.refresh()', () => {
    const manager = fakeManager()
    registerCommands(fakeContext(), { manager, pool: fakePool() })

    getRegisteredHandler('freemarker.refresh')()

    expect(manager.refresh).toHaveBeenCalledTimes(1)
  })

  test('stop command calls pool.shutdown()', () => {
    const pool = fakePool()
    registerCommands(fakeContext(), { manager: fakeManager(), pool })

    getRegisteredHandler('freemarker.stop')()

    expect(pool.shutdown).toHaveBeenCalledTimes(1)
  })
})
