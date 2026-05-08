import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface ProjectLayout {
  kind: 'spring-boot' | 'unknown'
  templatesRoot: string | null
}

const SPRING_BOOT_BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts']

const TEMPLATE_DIR_CANDIDATES = [
  'src/main/resources/templates',
  'src/main/resources/email-templates',
  'src/main/resources/email',
  'email-templates',
]

export function detectProjectLayout(cwd: string): ProjectLayout {
  const isSpringBoot = SPRING_BOOT_BUILD_FILES.some((f) =>
    existsSync(join(cwd, f)),
  )

  const templatesRoot = TEMPLATE_DIR_CANDIDATES.find((rel) => {
    const abs = join(cwd, rel)
    return existsSync(abs) && statSync(abs).isDirectory()
  }) ?? null

  return {
    kind: isSpringBoot ? 'spring-boot' : 'unknown',
    templatesRoot,
  }
}
