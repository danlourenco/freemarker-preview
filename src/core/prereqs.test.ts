import { describe, test, expect } from 'vitest'
import { checkPrerequisites, _resetPrereqCache } from './prereqs.ts'

describe('checkPrerequisites', () => {
  test('reports java + jbang as ok on this machine (which has both installed)', () => {
    _resetPrereqCache()
    const result = checkPrerequisites()
    const names = result.map((r) => r.name).sort()
    expect(names).toEqual(['java', 'jbang'])
    for (const r of result) {
      expect(r.ok, `expected ${r.name} to be ok`).toBe(true)
    }
  })

  test('reports a tool as missing when PATH cannot find it', () => {
    _resetPrereqCache()
    const originalPath = process.env.PATH
    try {
      process.env.PATH = '/nonexistent-dir-for-prereq-test'
      const result = checkPrerequisites()
      for (const r of result) {
        expect(r.ok, `${r.name} should be missing`).toBe(false)
        expect(r.installHint).toMatch(/install/i)
      }
    } finally {
      process.env.PATH = originalPath
    }
  })

  test('caches results for the process lifetime', () => {
    _resetPrereqCache()
    const a = checkPrerequisites()
    const b = checkPrerequisites()
    expect(b).toBe(a) // same object reference because cached
  })
})
