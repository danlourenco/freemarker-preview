import type { FreemarkerError } from './errors.ts'

export interface FormatErrorOptions {
  colors: boolean
}

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
} as const

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

  const snippet = renderSnippet(source, err.line, c)
  return `${header}\n\n${snippet}`
}

function renderSnippet(
  source: string,
  errLine: number,
  c: typeof ANSI | { reset: string; red: string; bold: string; dim: string },
): string {
  const lines = source.split('\n')
  const start = Math.max(1, errLine - 1)
  const end = Math.min(lines.length, errLine + 1)
  const gutterWidth = String(end).length
  const out: string[] = []
  for (let n = start; n <= end; n++) {
    const line = lines[n - 1] ?? ''
    const num = String(n).padStart(gutterWidth, ' ')
    if (n === errLine) {
      out.push(`${c.red}> ${num} | ${line}${c.reset}`)
    } else {
      out.push(`${c.dim}  ${num} | ${line}${c.reset}`)
    }
  }
  return out.join('\n')
}
