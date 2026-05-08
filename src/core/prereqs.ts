import { spawnSync } from 'node:child_process'

export interface Prereq {
  name: string
  ok: boolean
  installHint: string
}

const JAVA_HINT =
  'java not found on PATH. freemarker-preview needs a JRE (Java 17+).\n' +
  '  install:  brew install openjdk@21        (macOS)\n' +
  '            apt install default-jre        (Debian/Ubuntu)\n' +
  '            https://adoptium.net/          (other platforms)'

const JBANG_HINT =
  'jbang not found on PATH. freemarker-preview uses JBang to run the FreeMarker render script.\n' +
  '  install:  brew install jbang                                          (macOS)\n' +
  '            curl -Ls https://sh.jbang.dev | bash -s - app setup         (Linux)\n' +
  '            https://www.jbang.dev/download                              (other)'

let cached: Prereq[] | null = null

export function checkPrerequisites(): Prereq[] {
  if (cached) return cached
  cached = [
    { name: 'java', ok: hasOnPath('java'), installHint: JAVA_HINT },
    { name: 'jbang', ok: hasOnPath('jbang'), installHint: JBANG_HINT },
  ]
  return cached
}

export function ensurePrerequisites(): void {
  const missing = checkPrerequisites().filter((p) => !p.ok)
  if (missing.length === 0) return
  for (const m of missing) {
    process.stderr.write(`${m.installHint}\n\n`)
  }
  process.exit(1)
}

/** Test-only: reset the in-process cache. */
export function _resetPrereqCache(): void {
  cached = null
}

function hasOnPath(cmd: string): boolean {
  const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
  }
  return result.status === 0
}
