import * as vscode from 'vscode'
import { checkPrerequisites } from '../core/prereqs.ts'

export function prereqsOkOrWarn(): boolean {
  const missing = checkPrerequisites().filter((p) => !p.ok)
  if (missing.length === 0) return true
  for (const m of missing) {
    vscode.window.showErrorMessage(m.installHint)
  }
  return false
}
