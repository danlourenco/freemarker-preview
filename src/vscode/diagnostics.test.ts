import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { DiagnosticsManager } from './diagnostics.ts'
import { FreemarkerError } from '../core/errors.ts'

function lastCollection() {
  const calls = (vscode.languages.createDiagnosticCollection as unknown as {
    mock: { results: { value: ReturnType<typeof Object> }[] }
  }).mock.results
  return calls[calls.length - 1].value as {
    set: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    _store: Map<string, vscode.Diagnostic[]>
  }
}

describe('DiagnosticsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('surface() places one Error diagnostic at the right line/col (1-based → 0-based)', () => {
    const mgr = new DiagnosticsManager()
    const uri = vscode.Uri.file('/tmp/t/welcome.ftlh')
    const error = new FreemarkerError({
      type: 'undefined-variable',
      message: 'user is undefined',
      line: 7,
      column: 12,
      templatePath: '/tmp/t/welcome.ftlh',
    })

    mgr.surface(uri, error)

    const collection = lastCollection()
    const stored = collection._store.get(uri.fsPath)
    expect(stored).toHaveLength(1)
    const diag = stored![0]
    expect(diag.severity).toBe(vscode.DiagnosticSeverity.Error)
    expect(diag.range.start.line).toBe(6)
    expect(diag.range.start.character).toBe(11)
    expect(diag.message).toContain('undefined-variable')
    expect(diag.message).toContain('user is undefined')
  })

  test('clear(uri) removes diagnostics for that URI', () => {
    const mgr = new DiagnosticsManager()
    const uri = vscode.Uri.file('/tmp/t/welcome.ftlh')
    const error = new FreemarkerError({
      type: 'template-parse',
      message: 'parse error',
      line: 1,
      column: 1,
      templatePath: '/tmp/t/welcome.ftlh',
    })
    mgr.surface(uri, error)

    mgr.clear(uri)

    const collection = lastCollection()
    expect(collection._store.has(uri.fsPath)).toBe(false)
  })

  test('error without line info → diagnostic at line 0, column 0', () => {
    const mgr = new DiagnosticsManager()
    const uri = vscode.Uri.file('/tmp/t/welcome.ftlh')
    const error = new FreemarkerError({
      type: 'internal',
      message: 'something went wrong',
      templatePath: '/tmp/t/welcome.ftlh',
    })

    mgr.surface(uri, error)

    const stored = lastCollection()._store.get(uri.fsPath)
    expect(stored).toHaveLength(1)
    expect(stored![0].range.start.line).toBe(0)
    expect(stored![0].range.start.character).toBe(0)
  })

  test('two surfaces for the same URI → second replaces the first', () => {
    const mgr = new DiagnosticsManager()
    const uri = vscode.Uri.file('/tmp/t/welcome.ftlh')
    const a = new FreemarkerError({
      type: 'undefined-variable',
      message: 'first',
      line: 1,
      templatePath: uri.fsPath,
    })
    const b = new FreemarkerError({
      type: 'template-parse',
      message: 'second',
      line: 5,
      templatePath: uri.fsPath,
    })

    mgr.surface(uri, a)
    mgr.surface(uri, b)

    const stored = lastCollection()._store.get(uri.fsPath)
    expect(stored).toHaveLength(1)
    expect(stored![0].message).toContain('second')
  })
})
