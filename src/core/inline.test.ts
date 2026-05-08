import { describe, test, expect } from 'vitest'
import { inlineCss } from './inline.ts'

describe('inlineCss', () => {
  test('moves a simple <style> block onto matching child elements as style="..."', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    .greeting { color: red; font-size: 14px; }
  </style>
</head>
<body>
  <p class="greeting">Hello</p>
</body>
</html>`

    const out = inlineCss(html)

    expect(out).toMatch(/<p[^>]*class="greeting"[^>]*style="[^"]*color: red[^"]*"/)
    expect(out).toMatch(/<p[^>]*style="[^"]*font-size: 14px[^"]*"/)
  })

  test('preserves @media queries by default', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    .body { color: red; }
    @media (prefers-color-scheme: dark) {
      .body { color: white; }
    }
  </style>
</head>
<body>
  <p class="body">x</p>
</body>
</html>`

    const out = inlineCss(html)

    expect(out).toContain('@media (prefers-color-scheme: dark)')
    expect(out).toMatch(/<p[^>]*style="[^"]*color: red[^"]*"/)
  })
})
