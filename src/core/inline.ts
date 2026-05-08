import juice from 'juice'

export interface InlineCssOptions {
  preserveMediaQueries?: boolean
  [key: string]: unknown
}

const DEFAULTS: InlineCssOptions = {
  preserveMediaQueries: true,
}

export function inlineCss(html: string, opts: InlineCssOptions = {}): string {
  return juice(html, { ...DEFAULTS, ...opts })
}
