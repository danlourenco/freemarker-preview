import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join, posix, win32 } from 'node:path'
import { homedir, platform } from 'node:os'

export const MAX_LOG_BYTES = 10 * 1024 * 1024
const KEEP_ARCHIVES = 3
const ENV_OVERRIDE = 'FREEMARKER_PREVIEW_DEBUG_LOG'

export interface PathContext {
  platform: NodeJS.Platform
  homedir: string
  env: NodeJS.ProcessEnv
}

/**
 * Pure path resolver. Exported so cross-platform behavior can be unit-tested
 * without mocking node:os.
 *
 * Resolution order:
 *  1. FREEMARKER_PREVIEW_DEBUG_LOG env var (always wins)
 *  2. Windows: %LOCALAPPDATA%\freemarker-preview\debug.log
 *  3. POSIX: $XDG_CACHE_HOME/freemarker-preview/debug.log
 *  4. POSIX fallback: $HOME/.cache/freemarker-preview/debug.log
 */
export function computeDebugLogPath(ctx: PathContext): string {
  const override = ctx.env[ENV_OVERRIDE]
  if (override) return override

  const j = ctx.platform === 'win32' ? win32.join : posix.join

  if (ctx.platform === 'win32') {
    const local = ctx.env.LOCALAPPDATA
    if (local) return j(local, 'freemarker-preview', 'debug.log')
  }

  const xdg = ctx.env.XDG_CACHE_HOME
  const base = xdg || j(ctx.homedir, '.cache')
  return j(base, 'freemarker-preview', 'debug.log')
}

export function getDebugLogPath(): string {
  return computeDebugLogPath({
    platform: platform(),
    homedir: homedir(),
    env: process.env,
  })
}

export function rotateIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) return
  const { size } = statSync(logPath)
  if (size <= MAX_LOG_BYTES) return

  const oldest = `${logPath}.${KEEP_ARCHIVES}`
  if (existsSync(oldest)) rmSync(oldest)

  for (let i = KEEP_ARCHIVES - 1; i >= 1; i--) {
    const from = `${logPath}.${i}`
    const to = `${logPath}.${i + 1}`
    if (existsSync(from)) renameSync(from, to)
  }

  renameSync(logPath, `${logPath}.1`)
}

export function debugLog(message: string): void {
  const logPath = getDebugLogPath()
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  rotateIfNeeded(logPath)
  const line = `[${new Date().toISOString()}] ${message}\n`
  appendFileSync(logPath, line, 'utf8')
}
