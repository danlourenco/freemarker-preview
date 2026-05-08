import type { FreemarkerError } from './errors.ts'

export interface FormatErrorOptions {
  colors: boolean
}

export interface Snippet {
  startLine: number
  errorLine: number
  lines: string[]
}

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
} as const

export function extractSnippet(source: string, errorLine: number): Snippet {
  const all = source.split('\n')
  const startLine = Math.max(1, errorLine - 1)
  const endLine = Math.min(all.length, errorLine + 1)
  const lines: string[] = []
  for (let n = startLine; n <= endLine; n++) {
    lines.push(all[n - 1] ?? '')
  }
  return { startLine, errorLine, lines }
}

export function formatError(
  err: FreemarkerError,
  source: string | undefined,
  opts: FormatErrorOptions,
): string {
  const c = opts.colors ? ANSI : { reset: '', red: '', bold: '', dim: '' }
  const location = err.line
    ? `${err.templatePath}:${err.line}${err.column ? `:${err.column}` : ''}`
    : err.templatePath
  const header = `${c.bold}${c.red}${err.type}${c.reset}${c.bold} at ${location}${c.reset}\n  ${err.message}`

  if (!source || !err.line) return header

  const snippet = extractSnippet(source, err.line)
  const gutterWidth = String(snippet.startLine + snippet.lines.length - 1).length
  const out: string[] = []
  for (let i = 0; i < snippet.lines.length; i++) {
    const n = snippet.startLine + i
    const line = snippet.lines[i] ?? ''
    const num = String(n).padStart(gutterWidth, ' ')
    if (n === snippet.errorLine) {
      out.push(`${c.red}> ${num} | ${line}${c.reset}`)
    } else {
      out.push(`${c.dim}  ${num} | ${line}${c.reset}`)
    }
  }
  return `${header}\n\n${out.join('\n')}`
}
