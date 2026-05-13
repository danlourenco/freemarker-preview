import * as vscode from 'vscode'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { registerCommands } from './commands.ts'
import { DaemonPool } from './daemon-pool.ts'
import { PreviewPanelManager } from './preview-panel.ts'
import { registerSaveWatcher } from './save-watcher.ts'
import { TemplateTreeProvider } from './tree-provider.ts'
import { StatusBarManager } from './status-bar.ts'
import {
  computeRegistryPath,
  findProjectForCwd,
  loadRegistry,
  type RegistryProjectEntry,
} from '../core/registry.ts'

declare const __dirname: string

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('FreeMarker')
  context.subscriptions.push(output)
  output.appendLine(`[freemarker-preview] activated at ${new Date().toISOString()}`)

  const registryPath = computeRegistryPath({
    platform: process.platform,
    homedir: homedir(),
    env: process.env,
  })
  output.appendLine(`[freemarker-preview] registry path: ${registryPath}`)

  const resolveProject = (uri: vscode.Uri): RegistryProjectEntry | null => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    const cwd = workspaceFolder?.uri.fsPath ?? uri.fsPath
    const registry = loadRegistry(registryPath)
    const match = findProjectForCwd(cwd, registry)
    output.appendLine(
      `[freemarker-preview] resolveProject(${uri.fsPath}) under cwd=${cwd} → ${match ? match.projectPath : 'NULL'}`,
    )
    return match?.entry ?? null
  }

  const javaScriptPath = path.join(__dirname, 'java', 'Render.java')
  output.appendLine(`[freemarker-preview] javaScriptPath: ${javaScriptPath}`)

  const manager = new PreviewPanelManager({
    poolFactory: (opts) => {
      output.appendLine(
        `[freemarker-preview] spawning daemon pool with templatesRoot=${opts.templatesRoot}, javaScriptPath=${opts.javaScriptPath}`,
      )
      return new DaemonPool({
        ...opts,
        onStderr: (chunk) => output.append(`[daemon stderr] ${chunk}`),
      })
    },
    daemonOptionsExtra: {
      javaScriptPath,
      previewMissingAs: 'placeholder',
    },
    resolveProject,
    extensionUri: context.extensionUri,
  })

  registerCommands(context, { manager })
  registerSaveWatcher(context, manager)
  const statusBar = new StatusBarManager(manager)
  context.subscriptions.push(statusBar)

  const treeProvider = new TemplateTreeProvider({
    getTemplatesRoot: () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!cwd) return null
      return findProjectForCwd(cwd, loadRegistry(registryPath))?.entry.templatesRoot ?? null
    },
  })
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('freemarkerTemplates', treeProvider),
    vscode.commands.registerCommand('freemarker.refreshTree', () => treeProvider.refresh()),
  )

  context.subscriptions.push({ dispose: () => void manager.shutdownPool() })
}

export function deactivate(): void {}
