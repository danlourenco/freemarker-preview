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

function defaultStatusBarItem() {
  return {
    text: '',
    tooltip: '',
    command: undefined as string | undefined,
    backgroundColor: undefined as unknown,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }
}

export const window = {
  createWebviewPanel: vi.fn(defaultPanel),
  showErrorMessage: vi.fn(),
  activeTextEditor: undefined as { document: { uri: { fsPath: string } } } | undefined,
  registerTreeDataProvider: vi.fn(() => new Disposable(() => {})),
  createOutputChannel: vi.fn(defaultOutputChannel),
  createStatusBarItem: vi.fn(defaultStatusBarItem),
  registerWebviewPanelSerializer: vi.fn(() => new Disposable(() => {})),
}

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
} as const

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const

export class Diagnostic {
  source?: string
  code?: string
  constructor(
    public range: Range,
    public message: string,
    public severity: number = DiagnosticSeverity.Error,
  ) {}
}

function defaultDiagnosticCollection() {
  const store = new Map<string, Diagnostic[]>()
  return {
    name: 'freemarker',
    set: vi.fn((uri: { fsPath: string }, diags: Diagnostic[]) => {
      store.set(uri.fsPath, diags)
    }),
    delete: vi.fn((uri: { fsPath: string }) => {
      store.delete(uri.fsPath)
    }),
    get: vi.fn((uri: { fsPath: string }) => store.get(uri.fsPath) ?? []),
    clear: vi.fn(() => store.clear()),
    dispose: vi.fn(),
    _store: store,
  }
}

export const languages = {
  createDiagnosticCollection: vi.fn(defaultDiagnosticCollection),
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
