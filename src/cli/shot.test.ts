import { describe, test, expect } from 'vitest'
import { defaultOutputPath, parseShotArgs } from './commands/shot.ts'

describe('shot command', () => {
  describe('defaultOutputPath', () => {
    const fixedDate = new Date(2026, 4, 8, 9, 37, 12) // 2026-05-08T09:37:12 local

    test('multi-fixture: combines template stem, fixture name, timestamp', () => {
      const out = defaultOutputPath(
        '/abs/welcome.ftlh',
        '/abs/welcome.fixtures/new-user.json',
        fixedDate,
      )
      expect(out).toBe('welcome-new-user-20260508T093712.png')
    })

    test('sibling fallback: uses template stem + timestamp only', () => {
      const out = defaultOutputPath('/abs/hello.ftlh', '/abs/hello.json', fixedDate)
      expect(out).toBe('hello-20260508T093712.png')
    })

    test('handles .ftl extension', () => {
      const out = defaultOutputPath(
        '/abs/order.ftl',
        '/abs/order.fixtures/refunded.json',
        fixedDate,
      )
      expect(out).toBe('order-refunded-20260508T093712.png')
    })

    test('timestamp segment is filesystem-safe (no colons or slashes)', () => {
      const out = defaultOutputPath(
        '/abs/x.ftlh',
        '/abs/x.json',
        new Date(2026, 11, 31, 23, 59, 59),
      )
      expect(out).toBe('x-20261231T235959.png')
      expect(out).not.toMatch(/[:/]/)
    })
  })

  describe('parseShotArgs', () => {
    test('requires <template>', () => {
      expect(() => parseShotArgs([])).toThrowError(/missing <template>/)
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

    test('--data overrides the registry fixture', () => {
      const args = parseShotArgs(['x.ftlh', '--data', '/abs/x.json'])
      expect(args.data).toBe('/abs/x.json')
    })
  })
})
