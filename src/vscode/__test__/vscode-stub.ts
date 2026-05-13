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

function defaultOutputChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  }
}

export const window = {
  createWebviewPanel: vi.fn(defaultPanel),
  showErrorMessage: vi.fn(),
  activeTextEditor: undefined as { document: { uri: { fsPath: string } } } | undefined,
  registerTreeDataProvider: vi.fn(() => new Disposable(() => {})),
  createOutputChannel: vi.fn(defaultOutputChannel),
}

export class EventEmitter<T> {
  private listeners: ((value: T) => unknown)[] = []
  readonly event = (listener: (value: T) => unknown) => {
    this.listeners.push(listener)
    return new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    })
  }
  fire(value: T): void {
    for (const l of this.listeners) l(value)
  }
  dispose(): void {
    this.listeners = []
  }
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const

export class TreeItem {
  label: string
  collapsibleState: number
  command?: { command: string; title: string; arguments?: unknown[] }
  resourceUri?: { fsPath: string }
  contextValue?: string
  tooltip?: string
  iconPath?: unknown
  constructor(label: string, collapsibleState = TreeItemCollapsibleState.None) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

export const ThemeIcon = class {
  constructor(public readonly id: string) {}
}

export const commands = {
  registerCommand: vi.fn(() => new Disposable(() => {})),
  executeCommand: vi.fn(),
}

export const workspace = {
  onDidSaveTextDocument: vi.fn(() => new Disposable(() => {})),
  getWorkspaceFolder: vi.fn(),
  workspaceFolders: undefined as unknown,
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
