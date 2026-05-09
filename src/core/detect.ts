import { existsSync, statSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

export interface ProjectLayout {
  kind: 'spring-boot' | 'unknown'
  /** Absolute path of the detected Spring Boot project root, if any. */
  projectRoot: string | null
  /** Absolute path to the detected templates directory, if any. */
  templatesDir: string | null
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
    return { kind: 'unknown', projectRoot: null, templatesDir: null }
  }
  const templatesDir =
    TEMPLATE_DIR_CANDIDATES.map((rel) => join(projectRoot, rel)).find(
      (abs) => existsSync(abs) && statSync(abs).isDirectory(),
    ) ?? null
  return { kind: 'spring-boot', projectRoot, templatesDir }
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
