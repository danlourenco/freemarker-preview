import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectProjectLayout } from './detect.ts'

let scratch: string

beforeEach(() => {
  // realpathSync resolves macOS /var → /private/var so tests don't trip over
  // the symlink when comparing absolute paths.
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fmp-detect-')))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('detectProjectLayout', () => {
  test('Maven + src/main/resources/templates', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    mkdirSync(join(scratch, 'src/main/resources/templates'), { recursive: true })

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.projectRoot).toBe(scratch)
    expect(got.templatesDir).toBe(join(scratch, 'src/main/resources/templates'))
  })

  test('Gradle + email-templates/', () => {
    writeFileSync(join(scratch, 'build.gradle'), '')
    mkdirSync(join(scratch, 'email-templates'))

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.templatesDir).toBe(join(scratch, 'email-templates'))
  })

  test('walks up from a subdirectory to find the project root', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    mkdirSync(join(scratch, 'src/main/resources/templates/email'), {
      recursive: true,
    })

    // Run detection from deep inside the templates subdir
    const fromInside = join(scratch, 'src/main/resources/templates/email')
    const got = detectProjectLayout(fromInside)

    expect(got.kind).toBe('spring-boot')
    expect(got.projectRoot).toBe(scratch)
    expect(got.templatesDir).toBe(join(scratch, 'src/main/resources/templates'))
  })

  test('Spring Boot project but no templates dir → templatesDir is null', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.projectRoot).toBe(scratch)
    expect(got.templatesDir).toBeNull()
  })

  test('No build files anywhere → kind unknown, projectRoot null', () => {
    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('unknown')
    expect(got.projectRoot).toBeNull()
    expect(got.templatesDir).toBeNull()
  })
})
