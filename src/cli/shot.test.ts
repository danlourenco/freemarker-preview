import { describe, test, expect } from 'vitest'
import { defaultOutputPath, parseShotArgs } from './commands/shot.ts'

describe('shot command', () => {
  describe('defaultOutputPath', () => {
    test('multi-fixture: combines template stem and fixture name', () => {
      const out = defaultOutputPath(
        '/abs/welcome.ftlh',
        '/abs/welcome.fixtures/new-user.json',
      )
      expect(out).toBe('welcome-new-user.png')
    })

    test('sibling fallback: uses template stem only', () => {
      const out = defaultOutputPath('/abs/hello.ftlh', '/abs/hello.json')
      expect(out).toBe('hello.png')
    })

    test('handles .ftl extension', () => {
      const out = defaultOutputPath(
        '/abs/order.ftl',
        '/abs/order.fixtures/refunded.json',
      )
      expect(out).toBe('order-refunded.png')
    })
  })

  describe('parseShotArgs', () => {
    test('requires <template>', () => {
      expect(() => parseShotArgs([])).toThrowError(/missing <template>/)
    })

    test('parses --fixture, --out, --no-inline-css', () => {
      const args = parseShotArgs([
        'welcome.ftlh',
        '--fixture',
        'new-user',
        '--out',
        'evidence.png',
        '--no-inline-css',
      ])
      expect(args.template).toBe('welcome.ftlh')
      expect(args.fixture).toBe('new-user')
      expect(args.out).toBe('evidence.png')
      expect(args.noInlineCss).toBe(true)
    })

    test('--data takes precedence over fixture conventions (passed through unchanged)', () => {
      const args = parseShotArgs(['x.ftlh', '--data', '/abs/x.json'])
      expect(args.data).toBe('/abs/x.json')
      expect(args.fixture).toBeUndefined()
    })
  })
})
