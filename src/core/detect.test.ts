import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectProjectLayout } from './detect.ts'

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'fmp-detect-'))
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
    expect(got.templatesRoot).toBe('src/main/resources/templates')
  })

  test('Gradle + email-templates/', () => {
    writeFileSync(join(scratch, 'build.gradle'), '')
    mkdirSync(join(scratch, 'email-templates'))

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.templatesRoot).toBe('email-templates')
  })

  test('Gradle Kotlin DSL + src/main/resources/email/', () => {
    writeFileSync(join(scratch, 'build.gradle.kts'), '')
    mkdirSync(join(scratch, 'src/main/resources/email'), { recursive: true })

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.templatesRoot).toBe('src/main/resources/email')
  })

  test('Spring Boot project but no templates dir → templatesRoot is null', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')

    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('spring-boot')
    expect(got.templatesRoot).toBeNull()
  })

  test('No build files → kind is unknown, templatesRoot is null', () => {
    const got = detectProjectLayout(scratch)

    expect(got.kind).toBe('unknown')
    expect(got.templatesRoot).toBeNull()
  })
})
