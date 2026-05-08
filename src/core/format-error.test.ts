import { describe, test, expect } from 'vitest'
import { formatError } from './format-error.ts'
import { FreemarkerError } from './errors.ts'

const err = (overrides: Partial<ConstructorParameters<typeof FreemarkerError>[0]> = {}) =>
  new FreemarkerError({
    type: 'undefined-variable',
    message: 'recipient.naem is undefined',
    line: 4,
    column: 17,
    templatePath: '/abs/welcome.ftlh',
    ...overrides,
  })

describe('formatError', () => {
  test('renders a header with templatePath:line:column type: message', () => {
    const out = formatError(err(), undefined, { colors: false })
    expect(out).toContain('/abs/welcome.ftlh:4:17')
    expect(out).toContain('undefined-variable')
    expect(out).toContain('recipient.naem is undefined')
  })

  test('renders a 3-line snippet around the offending line when source is provided', () => {
    const source = [
      '<!DOCTYPE html>',
      '<html>',
      '<body>',
      '<p>Hello, ${recipient.naem}!</p>',
      '</body>',
      '</html>',
    ].join('\n')

    const out = formatError(err({ line: 4 }), source, { colors: false })

    expect(out).toMatch(/^\s*3 \|\s*<body>$/m)
    expect(out).toMatch(/^>\s*4 \|\s*<p>Hello, \$\{recipient\.naem\}!<\/p>$/m)
    expect(out).toMatch(/^\s*5 \|\s*<\/body>$/m)
    expect(out).not.toMatch(/^\s*2 \|/m)
    expect(out).not.toMatch(/^\s*6 \|/m)
  })

  test('omits snippet entirely when no source is provided', () => {
    const out = formatError(err(), undefined, { colors: false })
    expect(out).not.toMatch(/\d+ \|/)
  })

  test('off-by-one: error on line 1 shows lines 1..2 only', () => {
    const source = ['line1', 'line2', 'line3'].join('\n')
    const out = formatError(err({ line: 1 }), source, { colors: false })

    expect(out).toMatch(/^>\s*1 \|\s*line1$/m)
    expect(out).toMatch(/^\s*2 \|\s*line2$/m)
    expect(out).not.toMatch(/^\s*3 \|/m)
    expect(out).not.toMatch(/^\s*0 \|/m)
  })

  test('off-by-one: error on last line shows last-1..last only', () => {
    const source = ['line1', 'line2', 'line3'].join('\n')
    const out = formatError(err({ line: 3 }), source, { colors: false })

    expect(out).toMatch(/^\s*2 \|\s*line2$/m)
    expect(out).toMatch(/^>\s*3 \|\s*line3$/m)
    expect(out).not.toMatch(/^\s*4 \|/m)
  })

  test('emits ANSI escape codes when colors is true', () => {
    const out = formatError(err(), 'line1\nline2\nline3\nline4\n', {
      colors: true,
    })
    expect(out).toMatch(/\x1b\[/)
  })

  test('emits no ANSI escape codes when colors is false', () => {
    const out = formatError(err(), 'line1\nline2\nline3\nline4\n', {
      colors: false,
    })
    expect(out).not.toMatch(/\x1b\[/)
  })

  test.each([
    'template-parse',
    'undefined-variable',
    'template-not-found',
    'template-runtime',
    'fixture-read',
    'fixture-parse',
    'internal',
  ] as const)('formats %s errors with the type label visible', (type) => {
    const out = formatError(err({ type, message: 'x' }), undefined, {
      colors: false,
    })
    expect(out).toContain(type)
  })
})
