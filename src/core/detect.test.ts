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

describe('detectProjectLayout — templateCandidates', () => {
  test('single bare templates dir returns just that dir', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    mkdirSync(join(scratch, 'src/main/resources/templates'), { recursive: true })

    const got = detectProjectLayout(scratch)

    expect(got.templateCandidates).toEqual([
      join(scratch, 'src/main/resources/templates'),
    ])
    // backcompat: templatesDir is the first candidate
    expect(got.templatesDir).toBe(got.templateCandidates[0])
  })

  test('includes immediate non-hidden subdirectories of detected dirs', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    const templates = join(scratch, 'src/main/resources/templates')
    mkdirSync(join(templates, 'email'), { recursive: true })
    mkdirSync(join(templates, 'customer'), { recursive: true })
    mkdirSync(join(templates, '.hidden'), { recursive: true })

    const got = detectProjectLayout(scratch)

    expect(got.templateCandidates).toEqual([
      templates,
      join(templates, 'customer'),
      join(templates, 'email'),
    ])
  })

  test('multiple detected dirs each contribute their own subdirs', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    const templates = join(scratch, 'src/main/resources/templates')
    const emailTemplates = join(scratch, 'src/main/resources/email-templates')
    mkdirSync(join(templates, 'email'), { recursive: true })
    mkdirSync(join(emailTemplates, 'welcome'), { recursive: true })

    const got = detectProjectLayout(scratch)

    // Candidate list order (templates before email-templates) is preserved;
    // each detected dir is immediately followed by its subdirs.
    expect(got.templateCandidates).toEqual([
      templates,
      join(templates, 'email'),
      emailTemplates,
      join(emailTemplates, 'welcome'),
    ])
  })

  test('no detected templates dir → empty templateCandidates list', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')

    const got = detectProjectLayout(scratch)

    expect(got.templateCandidates).toEqual([])
    expect(got.templatesDir).toBeNull()
  })

  test('detected dir without subdirs returns just itself', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    mkdirSync(join(scratch, 'src/main/resources/templates'), { recursive: true })

    const got = detectProjectLayout(scratch)

    expect(got.templateCandidates).toEqual([
      join(scratch, 'src/main/resources/templates'),
    ])
  })

  test('files in the detected dir do not appear as candidates', () => {
    writeFileSync(join(scratch, 'pom.xml'), '<project/>')
    const templates = join(scratch, 'src/main/resources/templates')
    mkdirSync(templates, { recursive: true })
    writeFileSync(join(templates, 'welcome.ftlh'), 'ok')
    mkdirSync(join(templates, 'email'))

    const got = detectProjectLayout(scratch)

    // Only the email subdir; welcome.ftlh is a file, not a directory.
    expect(got.templateCandidates).toEqual([templates, join(templates, 'email')])
  })
})
