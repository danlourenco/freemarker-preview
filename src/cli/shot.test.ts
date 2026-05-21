import { describe, test, expect } from 'vitest'
import { defaultOutputPath, parseShotArgs } from './commands/shot.ts'

describe('shot command', () => {
  describe('defaultOutputPath', () => {
    const fixedDate = new Date(2026, 4, 8, 9, 37, 12) // 2026-05-08T09:37:12 local

    test('uses template stem + timestamp', () => {
      const out = defaultOutputPath('/abs/welcome.ftlh', fixedDate)
      expect(out).toBe('welcome-20260508T093712.png')
    })

    test('handles .ftl extension', () => {
      const out = defaultOutputPath('/abs/order.ftl', fixedDate)
      expect(out).toBe('order-20260508T093712.png')
    })

    test('timestamp segment is filesystem-safe (no colons or slashes)', () => {
      const out = defaultOutputPath('/abs/x.ftlh', new Date(2026, 11, 31, 23, 59, 59))
      expect(out).toBe('x-20261231T235959.png')
      expect(out).not.toMatch(/[:/]/)
    })
  })

  describe('parseShotArgs', () => {
    test('requires <template>', () => {
      expect(() => parseShotArgs([])).toThrowError(/missing <template>/)
    })

    test('parses template positional arg', () => {
      const args = parseShotArgs(['welcome.ftlh'])
      expect(args.template).toBe('welcome.ftlh')
      expect(args.out).toBeUndefined()
      expect(args.noInlineCss).toBe(false)
    })

    test('parses --out and --no-inline-css', () => {
      const args = parseShotArgs([
        'welcome.ftlh',
        '--out',
        'evidence.png',
        '--no-inline-css',
      ])
      expect(args.template).toBe('welcome.ftlh')
      expect(args.out).toBe('evidence.png')
      expect(args.noInlineCss).toBe(true)
    })

    test('does not have a data field', () => {
      const args = parseShotArgs(['x.ftlh'])
      expect(args).not.toHaveProperty('data')
    })
  })
})
