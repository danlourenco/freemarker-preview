export type ForeignSyntaxKind =
  | 'ampscript'
  | 'mustache'
  | 'block-tag'
  | 'jsp-tag'
  | 'php-tag'

export interface ForeignSyntaxFinding {
  kind: ForeignSyntaxKind
  /** The matched text, verbatim. */
  snippet: string
  /** 0-based index into the input where the match starts. */
  index: number
  /** 1-based line number of the match start. */
  line: number
  /** 1-based column number of the match start. */
  column: number
}

interface PatternDef {
  kind: ForeignSyntaxKind
  regex: RegExp
}

// Patterns are intentionally narrow to keep false positives low. We're
// flagging clearly-not-HTML-and-clearly-not-FreeMarker syntax that leaked
// from another template engine and didn't get interpolated.
//
// Notably absent: ${...}. FreeMarker uses that itself, so a literal ${ in
// rendered output usually means "the template explicitly escaped it" or
// "this is a code sample/CSS calc()" — both legitimate. Flagging would be
// too noisy.
const PATTERNS: readonly PatternDef[] = [
  // AMPscript inline: %%=expr=%%
  { kind: 'ampscript', regex: /%%=[\s\S]*?=%%/g },
  // AMPscript blocks: %%[ ... ]%%
  { kind: 'ampscript', regex: /%%\[[\s\S]*?\]%%/g },
  // Mustache / Handlebars / Liquid output: {{ ... }} (including triple-stache)
  // Match content that doesn't itself contain `{` so we don't eat past a
  // closing `}}` into the next opener.
  { kind: 'mustache', regex: /\{\{\{?[^{}]*\}?\}\}/g },
  // Liquid / Jinja / Django block tags: {% ... %}
  { kind: 'block-tag', regex: /\{%[\s\S]*?%\}/g },
  // JSP / ERB / EJS scriptlets: <% ... %>
  { kind: 'jsp-tag', regex: /<%[\s\S]*?%>/g },
  // PHP tags: <? ... ?>
  { kind: 'php-tag', regex: /<\?[\s\S]*?\?>/g },
]

/**
 * Scan rendered HTML for un-interpolated template syntax that leaked
 * through from another engine (SFMC AMPscript, Mustache/Handlebars/Liquid,
 * Jinja, JSP/ERB, PHP). Returns every match, ordered by position. Never
 * throws — this is meant to be a non-blocking flag, not a validator.
 */
export function detectForeignSyntax(input: string): ForeignSyntaxFinding[] {
  const findings: ForeignSyntaxFinding[] = []
  for (const { kind, regex } of PATTERNS) {
    // Fresh state per call: clone the regex so `lastIndex` doesn't leak
    // between invocations.
    const re = new RegExp(regex.source, regex.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(input)) !== null) {
      findings.push({
        kind,
        snippet: m[0],
        index: m.index,
        line: 0, // filled in below
        column: 0,
      })
      // Guard against zero-width matches that would loop forever.
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  findings.sort((a, b) => a.index - b.index)
  for (const f of findings) {
    const { line, column } = lineColumnOf(input, f.index)
    f.line = line
    f.column = column
  }
  return findings
}

function lineColumnOf(s: string, index: number): { line: number; column: number } {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < index; i++) {
    if (s.charCodeAt(i) === 10 /* \n */) {
      line++
      lastNewline = i
    }
  }
  return { line, column: index - lastNewline }
}
