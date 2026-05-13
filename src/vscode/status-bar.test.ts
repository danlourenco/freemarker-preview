import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { StatusBarManager, type RenderState, type RenderStateSource } from './status-bar.ts'

function fakeSource() {
  const emitter = new vscode.EventEmitter<RenderState>()
  const source: RenderStateSource = { onDidChangeRenderState: emitter.event }
  return { source, emit: (s: RenderState) => emitter.fire(s) }
}

function lastItem(): {
  text: string
  backgroundColor: unknown
  show: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  command?: string
} {
  const calls = (vscode.window.createStatusBarItem as unknown as {
    mock: { results: { value: ReturnType<typeof Object> }[] }
  }).mock.results
  return calls[calls.length - 1].value as ReturnType<typeof lastItem>
}

describe('StatusBarManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rendering event sets text to a rendering indicator and clears backgroundColor', () => {
    const { source, emit } = fakeSource()
    new StatusBarManager(source)
    const item = lastItem()
    // simulate previous error state to verify backgroundColor gets cleared
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')

    emit('rendering')

    expect(item.text).toMatch(/render/i)
    expect(item.backgroundColor).toBeUndefined()
    expect(item.show).toHaveBeenCalled()
  })

  test('idle event sets text to an idle indicator', () => {
    const { source, emit } = fakeSource()
    new StatusBarManager(source)
    const item = lastItem()

    emit('idle')

    expect(item.text).toMatch(/FreeMarker/i)
    expect(item.backgroundColor).toBeUndefined()
  })

  test('error event sets error text AND the error backgroundColor theme', () => {
    const { source, emit } = fakeSource()
    new StatusBarManager(source)
    const item = lastItem()

    emit('error')

    expect(item.text).toMatch(/error/i)
    const bg = item.backgroundColor as { id: string }
    expect(bg?.id).toBe('statusBarItem.errorBackground')
  })

  test('after dispose, further events do not update the item', () => {
    const { source, emit } = fakeSource()
    const mgr = new StatusBarManager(source)
    const item = lastItem()
    emit('rendering')
    const beforeText = item.text
    mgr.dispose()

    emit('error')

    expect(item.text).toBe(beforeText)
  })
})
