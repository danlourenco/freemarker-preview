import * as vscode from 'vscode'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { registerCommands } from './commands.ts'
import { DaemonPool } from './daemon-pool.ts'
import { PreviewPanelManager } from './preview-panel.ts'
import { registerSaveWatcher } from './save-watcher.ts'
import {
  computeRegistryPath,
  findProjectForCwd,
  loadRegistry,
  type RegistryProjectEntry,
} from '../core/registry.ts'

declare const __dirname: string

export function activate(context: vscode.ExtensionContext): void {
  const registryPath = computeRegistryPath({
    platform: process.platform,
    homedir: homedir(),
    env: process.env,
  })

  const resolveProject = (uri: vscode.Uri): RegistryProjectEntry | null => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    const cwd = workspaceFolder?.uri.fsPath ?? uri.fsPath
    const registry = loadRegistry(registryPath)
    return findProjectForCwd(cwd, registry)?.entry ?? null
  }

  const firstWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  const initialEntry = findProjectForCwd(firstWorkspaceRoot, loadRegistry(registryPath))?.entry
  const templatesRoot = initialEntry?.templatesRoot ?? firstWorkspaceRoot

  const javaScriptPath = path.join(__dirname, 'java', 'Render.java')

  const pool = new DaemonPool({
    templatesRoot,
    javaScriptPath,
    previewMissingAs: initialEntry?.previewMissingAs ?? 'placeholder',
    freemarkerSettings: initialEntry?.freemarker,
  })
  const manager = new PreviewPanelManager({ pool, resolveProject })

  registerCommands(context, { manager, pool })
  registerSaveWatcher(context, manager)

  context.subscriptions.push({ dispose: () => void pool.shutdown() })
}

export function deactivate(): void {}
