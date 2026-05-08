import { describe, test, expect } from 'vitest'
import { promoteDarkRules } from './index.ts'

describe('promoteDarkRules', () => {
  test('promotes @media (prefers-color-scheme: dark) rules to unconditional <style>', () => {
    const html = `<!DOCTYPE html>
<html><head>
<style>
.body { color: red; }
@media (prefers-color-scheme: dark) {
  .body { color: white; }
}
</style>
</head><body><p class="body">x</p></body></html>`

    const out = promoteDarkRules(html)

    // The promoted style is appended to head with !important so it beats
    // juice's inline-style attributes.
    expect(out).toMatch(/<style data-fmp-dark-promoted>/)
    expect(out).toMatch(/\.body\s*{\s*color:\s*white\s*!important\s*;?\s*}/)
    // Original media block is preserved
    expect(out).toContain('@media (prefers-color-scheme: dark)')
    // Hint meta is added for UA color-scheme
    expect(out).toContain('<meta name="color-scheme" content="dark">')
  })

  test('without dark rules: still injects color-scheme meta hint', () => {
    const html = `<html><head><style>.x{color:red}</style></head><body></body></html>`
    const out = promoteDarkRules(html)
    expect(out).toContain('<meta name="color-scheme" content="dark">')
    expect(out).not.toContain('data-fmp-dark-promoted')
  })

  test('handles HTML without a <head> element by prepending', () => {
    const html = `<body>x</body>`
    const out = promoteDarkRules(html)
    expect(out.indexOf('<meta name="color-scheme"')).toBeLessThan(
      out.indexOf('<body>'),
    )
  })

  test('multiple dark media blocks are all promoted with !important', () => {
    const html = `<html><head><style>
@media (prefers-color-scheme: dark) { .a { color: white; } }
@media (prefers-color-scheme: dark) and (max-width: 600px) { .b { color: gray; } }
</style></head></html>`
    const out = promoteDarkRules(html)
    expect(out).toMatch(/\.a\s*{\s*color:\s*white\s*!important;?\s*}/)
    expect(out).toMatch(/\.b\s*{\s*color:\s*gray\s*!important;?\s*}/)
  })

  test('does not double-apply !important when source already has it', () => {
    const html = `<html><head><style>
@media (prefers-color-scheme: dark) { .a { color: white !important; } }
</style></head></html>`
    const out = promoteDarkRules(html)
    expect(out).toMatch(/<style data-fmp-dark-promoted>/)
    // Exactly one !important per declaration
    const promoted = out.split('data-fmp-dark-promoted')[1] ?? ''
    const matches = promoted.match(/!important/g) ?? []
    expect(matches.length).toBe(1)
  })
})
