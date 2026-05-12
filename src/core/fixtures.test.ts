import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveFixtureOrEmpty } from './fixtures.ts'

let scratch: string
let emptyFallback: string

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fmp-fixtures-')))
  emptyFallback = join(scratch, 'empty.json')
  writeFileSync(emptyFallback, '{}', 'utf8')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('resolveFixtureOrEmpty', () => {
  test('returns the resolved fixture when one exists, with fallback=false', () => {
    const tpl = join(scratch, 'welcome.ftlh')
    const sibling = join(scratch, 'welcome.json')
    writeFileSync(tpl, 'ok')
    writeFileSync(sibling, '{"name":"Dan"}')

    const got = resolveFixtureOrEmpty(tpl, undefined, emptyFallback)

    expect(got).toEqual({ path: sibling, fallback: false })
  })

  test('returns the empty fallback when no fixture exists and no name was given', () => {
    const tpl = join(scratch, 'welcome.ftlh')
    writeFileSync(tpl, 'ok')

    const got = resolveFixtureOrEmpty(tpl, undefined, emptyFallback)

    expect(got).toEqual({ path: emptyFallback, fallback: true })
  })

  test('throws when an explicit fixtureName was given but cannot be found', () => {
    const tpl = join(scratch, 'welcome.ftlh')
    writeFileSync(tpl, 'ok')

    expect(() =>
      resolveFixtureOrEmpty(tpl, 'new-user', emptyFallback),
    ).toThrowError(/fixture/)
  })

  test('returns the named fixture when one exists', () => {
    const tpl = join(scratch, 'welcome.ftlh')
    writeFileSync(tpl, 'ok')
    const fixturesDir = join(scratch, 'welcome.fixtures')
    mkdirSync(fixturesDir)
    const named = join(fixturesDir, 'new-user.json')
    writeFileSync(named, '{"name":"Dan"}')

    const got = resolveFixtureOrEmpty(tpl, 'new-user', emptyFallback)

    expect(got).toEqual({ path: named, fallback: false })
  })
})
