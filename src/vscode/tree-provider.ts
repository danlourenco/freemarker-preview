import * as vscode from 'vscode'
import * as nodeFs from 'node:fs'
import { join } from 'node:path'

export type TemplateNode =
  | { kind: 'folder'; name: string; fsPath: string }
  | { kind: 'file'; name: string; fsPath: string }
  | { kind: 'placeholder' }

export interface DirEntry {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

export interface FsAdapter {
  readdirSync(path: string, options?: { withFileTypes: true }): DirEntry[]
}

export interface TreeProviderDeps {
  getTemplatesRoot: () => string | null
  fs?: FsAdapter
}

const TEMPLATE_EXTS = new Set(['.ftlh', '.ftl'])

function isTemplateFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && TEMPLATE_EXTS.has(name.slice(dot))
}

export class TemplateTreeProvider implements vscode.TreeDataProvider<TemplateNode> {
  private readonly getTemplatesRoot: () => string | null
  private readonly fs: FsAdapter
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TemplateNode | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(deps: TreeProviderDeps) {
    this.getTemplatesRoot = deps.getTemplatesRoot
    this.fs = deps.fs ?? { readdirSync: (p) => nodeFs.readdirSync(p, { withFileTypes: true }) }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(node: TemplateNode): vscode.TreeItem {
    if (node.kind === 'placeholder') {
      const item = new vscode.TreeItem('Run `freemarker-preview init` to register this workspace')
      item.tooltip = 'No project entry found in ~/.config/freemarker-preview/projects.json'
      return item
    }

    if (node.kind === 'folder') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed)
      item.resourceUri = vscode.Uri.file(node.fsPath)
      return item
    }

    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None)
    item.resourceUri = vscode.Uri.file(node.fsPath)
    item.command = {
      command: 'freemarker.preview',
      title: 'Preview',
      arguments: [vscode.Uri.file(node.fsPath)],
    }
    return item
  }

  async getChildren(element?: TemplateNode): Promise<TemplateNode[]> {
    if (!element) {
      const root = this.getTemplatesRoot()
      if (!root) return [{ kind: 'placeholder' }]
      return this.listDir(root)
    }
    if (element.kind === 'folder') {
      return this.listDir(element.fsPath)
    }
    return []
  }

  private listDir(path: string): TemplateNode[] {
    let entries: DirEntry[]
    try {
      entries = this.fs.readdirSync(path, { withFileTypes: true })
    } catch {
      return []
    }

    type FolderNode = Extract<TemplateNode, { kind: 'folder' }>
    type FileNode = Extract<TemplateNode, { kind: 'file' }>
    const folders: FolderNode[] = []
    const files: FileNode[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        folders.push({ kind: 'folder', name: entry.name, fsPath: join(path, entry.name) })
      } else if (entry.isFile() && isTemplateFile(entry.name)) {
        files.push({ kind: 'file', name: entry.name, fsPath: join(path, entry.name) })
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    return [...folders, ...files]
  }
}
