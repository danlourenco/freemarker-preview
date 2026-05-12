import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

export interface ProjectLayout {
  kind: 'spring-boot' | 'unknown'
  /** Absolute path of the detected Spring Boot project root, if any. */
  projectRoot: string | null
  /**
   * Best-guess templates directory: the first entry of `templateCandidates`.
   * Kept for backwards compatibility with callers that only need one path.
   */
  templatesDir: string | null
  /**
   * All plausible templates directories, ordered. For each detected dir from
   * the candidate list, the directory itself is included followed by its
   * immediate non-hidden subdirectories. Lets `init` surface common nested
   * layouts (e.g. `templates/` and `templates/email/` both exist) without
   * forcing the user into the directory picker.
   */
  templateCandidates: string[]
}

const SPRING_BOOT_BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts']

const TEMPLATE_DIR_CANDIDATES = [
  'src/main/resources/templates',
  'src/main/resources/email-templates',
  'src/main/resources/email',
  'email-templates',
]

/**
 * Walk up from `cwd` looking for a Spring Boot project root (a directory
 * containing `pom.xml`, `build.gradle`, or `build.gradle.kts`). When found,
 * probe the standard templates locations relative to that root.
 *
 * Walking up matters because users often run commands from inside a
 * templates subdirectory (e.g. `src/main/resources/templates/email`) — only
 * scanning cwd would miss the project root above and produce a useless
 * placeholder `templatesRoot`.
 */
export function detectProjectLayout(cwd: string): ProjectLayout {
  const projectRoot = findProjectRoot(cwd)
  if (!projectRoot) {
    return {
      kind: 'unknown',
      projectRoot: null,
      templatesDir: null,
      templateCandidates: [],
    }
  }
  const templateCandidates = collectTemplateCandidates(projectRoot)
  return {
    kind: 'spring-boot',
    projectRoot,
    templatesDir: templateCandidates[0] ?? null,
    templateCandidates,
  }
}

function collectTemplateCandidates(projectRoot: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const rel of TEMPLATE_DIR_CANDIDATES) {
    const abs = join(projectRoot, rel)
    if (!isDirectory(abs)) continue
    pushOnce(out, seen, abs)
    for (const sub of immediateSubdirs(abs)) {
      pushOnce(out, seen, sub)
    }
  }
  return out
}

function pushOnce(out: string[], seen: Set<string>, path: string): void {
  if (seen.has(path)) return
  seen.add(path)
  out.push(path)
}

function immediateSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => join(dir, d.name))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function isDirectory(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function findProjectRoot(start: string): string | null {
  let dir = start
  const root = parse(dir).root
  while (true) {
    if (SPRING_BOOT_BUILD_FILES.some((f) => existsSync(join(dir, f)))) {
      return dir
    }
    if (dir === root) return null
    dir = dirname(dir)
  }
}
