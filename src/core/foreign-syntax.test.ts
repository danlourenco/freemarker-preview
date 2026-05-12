import { describe, test, expect } from 'vitest'
import { detectForeignSyntax } from './foreign-syntax.ts'

describe('detectForeignSyntax', () => {
  test('empty input returns no findings', () => {
    expect(detectForeignSyntax('')).toEqual([])
  })

  test('plain HTML with no foreign syntax returns no findings', () => {
    const html = '<html><body><p>Hello <b>Dan</b>, welcome!</p></body></html>'
    expect(detectForeignSyntax(html)).toEqual([])
  })

  test('flags AMPscript inline output %%=...=%%', () => {
    const html = '<p>Hello %%=v(@firstName)=%%!</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: 'ampscript',
      snippet: '%%=v(@firstName)=%%',
    })
  })

  test('flags AMPscript blocks %%[...]%%', () => {
    const html = '<p>%%[ if @optedIn == true then ]%%opted in%%[ endif ]%%</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.kind === 'ampscript')).toBe(true)
  })

  test('flags Mustache/Handlebars/Liquid {{...}}', () => {
    const html = '<p>Hello {{user.name}}!</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'mustache', snippet: '{{user.name}}' })
  })

  test('flags Liquid/Jinja block tags {%...%}', () => {
    const html = '<p>{% if user.active %}active{% endif %}</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.kind === 'block-tag')).toBe(true)
  })

  test('flags JSP/ERB/EJS <%...%>', () => {
    const html = '<p>Hello <%= user.name %></p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'jsp-tag', snippet: '<%= user.name %>' })
  })

  test('flags PHP tags <?...?>', () => {
    const html = '<p><?php echo $name; ?></p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'php-tag', snippet: '<?php echo $name; ?>' })
  })

  test('returns findings ordered by index when multiple kinds appear', () => {
    const html = '<p>%%=name=%% and {{email}} and <%= phone %></p>'
    const findings = detectForeignSyntax(html)
    expect(findings.map((f) => f.kind)).toEqual(['ampscript', 'mustache', 'jsp-tag'])
    // ordered ascending
    expect(findings[0].index).toBeLessThan(findings[1].index)
    expect(findings[1].index).toBeLessThan(findings[2].index)
  })

  test('computes 1-based line and column', () => {
    const html = 'line 1\nline 2 has {{leak}} on it\nline 3'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0].line).toBe(2)
    expect(findings[0].column).toBe(12) // 1-based; "line 2 has " is 11 chars
  })

  test('does not flag legitimate HTML that contains percent signs or angle brackets', () => {
    const html = '<div style="width: 50%">100% off! Use code SAVE20.</div>'
    expect(detectForeignSyntax(html)).toEqual([])
  })

  test('does not flag CSS calc() or property values with dollar signs', () => {
    // FreeMarker's ${...} is intentionally NOT detected; the rendered output
    // legitimately doesn't contain ${...} after FreeMarker resolves it, and
    // false-positives on CSS calc() or code samples are too noisy.
    const html = '<style>.x { width: calc(100% - 20px); }</style><pre>${jsTemplateLiteral}</pre>'
    expect(detectForeignSyntax(html)).toEqual([])
  })

  test('triple-stache {{{ }}} is detected (as mustache)', () => {
    const html = '<p>{{{rawHtml}}}</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('mustache')
  })

  test('mustache regex does not greedily eat across multiple braces on one line', () => {
    const html = '<p>{{a}} and {{b}}</p>'
    const findings = detectForeignSyntax(html)
    expect(findings).toHaveLength(2)
    expect(findings[0].snippet).toBe('{{a}}')
    expect(findings[1].snippet).toBe('{{b}}')
  })
})
