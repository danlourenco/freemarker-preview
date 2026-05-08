import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir, platform } from 'node:os'

export const MAX_LOG_BYTES = 10 * 1024 * 1024
const KEEP_ARCHIVES = 3
const ENV_OVERRIDE = 'FREEMARKER_PREVIEW_DEBUG_LOG'

export function getDebugLogPath(): string {
  const override = process.env[ENV_OVERRIDE]
  if (override) return override

  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (local) return join(local, 'freemarker-preview', 'debug.log')
  }

  const xdg = process.env.XDG_CACHE_HOME
  const base = xdg || join(homedir(), '.cache')
  return join(base, 'freemarker-preview', 'debug.log')
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
