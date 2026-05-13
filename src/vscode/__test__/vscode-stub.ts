import { vi } from 'vitest'

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const

function defaultPanel() {
  return {
    webview: { cspSource: 'vscode-webview://stub', html: '', postMessage: vi.fn() },
    onDidDispose: vi.fn(() => new Disposable(() => {})),
    reveal: vi.fn(),
    dispose: vi.fn(),
    title: '',
  }
}

export const window = {
  createWebviewPanel: vi.fn(defaultPanel),
  showErrorMessage: vi.fn(),
}

export const commands = {
  registerCommand: vi.fn(() => new Disposable(() => {})),
  executeCommand: vi.fn(),
}

export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: 'file', path: p, toString: () => `file://${p}` }),
  parse: (s: string) => ({ fsPath: s, scheme: 'file', path: s, toString: () => s }),
}

export class Disposable {
  static from(...disposables: { dispose: () => unknown }[]): Disposable {
    return new Disposable(() => disposables.forEach((d) => d.dispose()))
  }
  constructor(private readonly cb: () => void) {}
  dispose(): void {
    this.cb()
  }
}
