import { dirname, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { render, type PreviewMissingAs } from '../../core/render.ts'
import { resolveFixture } from '../../core/fixtures.ts'
import { loadConfig } from '../../core/config.ts'
import { FreemarkerError } from '../../core/errors.ts'
import { formatError } from '../../core/format-error.ts'
import { inlineCss } from '../../core/inline.ts'

const VALID_MISSING_MODES: readonly PreviewMissingAs[] = [
  'error',
  'placeholder',
  'empty',
]

function parseMissingFlag(value: string | undefined): PreviewMissingAs {
  if (!VALID_MISSING_MODES.includes(value as PreviewMissingAs)) {
    throw new Error(
      `--missing must be one of ${VALID_MISSING_MODES.join(' | ')} (got ${value})`,
    )
  }
  return value as PreviewMissingAs
}

export interface RenderArgs {
  template: string
  fixture?: string
  data?: string
  json: boolean
  noInlineCss: boolean
  missing?: PreviewMissingAs
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let template: string | undefined
  let fixture: string | undefined
  let data: string | undefined
  let json = false
  let noInlineCss = false
  let missing: PreviewMissingAs | undefined

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--data') {
      data = argv[i + 1]
      i += 2
      continue
    }
    if (arg === '--fixture') {
      fixture = argv[i + 1]
      i += 2
      continue
    }
    if (arg === '--json') {
      json = true
      i += 1
      continue
    }
    if (arg === '--no-inline-css') {
      noInlineCss = true
      i += 1
      continue
    }
    if (arg === '--missing') {
      missing = parseMissingFlag(argv[i + 1])
      i += 2
      continue
    }
    if (!template && arg && !arg.startsWith('--')) {
      template = arg
      i += 1
      continue
    }
    i += 1
  }

  if (!template) throw new Error('render: missing <template> argument')

  return { template, fixture, data, json, noInlineCss, missing }
}

function emitFailure(err: unknown, json: boolean, templatePath?: string): void {
  if (err instanceof FreemarkerError) {
    if (json) {
      const envelope = {
        ok: false,
        error: {
          type: err.type,
          message: err.message,
          line: err.line,
          column: err.column,
          templatePath: err.templatePath,
        },
      }
      process.stderr.write(JSON.stringify(envelope))
      return
    }

    let source: string | undefined
    try {
      source = readFileSync(err.templatePath, 'utf8')
    } catch {
      source = undefined
    }
    const colors = process.stderr.isTTY ?? false
    process.stderr.write(`${formatError(err, source, { colors })}\n`)
    return
  }

  const msg = err instanceof Error ? err.message : String(err)
  if (json) {
    const envelope = {
      ok: false,
      error: {
        type: 'internal',
        message: msg,
        templatePath: templatePath ?? '',
      },
    }
    process.stderr.write(JSON.stringify(envelope))
  } else {
    process.stderr.write(`${msg}\n`)
  }
}

export async function runRender(argv: string[]): Promise<number> {
  let args: RenderArgs
  try {
    args = parseRenderArgs(argv)
  } catch (err) {
    emitFailure(err, false)
    return 1
  }

  let cfg
  try {
    cfg = loadConfig(process.cwd())
  } catch (err) {
    emitFailure(err, args.json)
    return 1
  }

  const templatesRoot =
    cfg.templatesRoot && cfg.configPath
      ? resolve(dirname(cfg.configPath), cfg.templatesRoot)
      : undefined

  // Try cwd-relative first so `render foo.ftlh` works whether the user is
  // sitting at the templates root or inside a subdirectory of it. Fall back
  // to templatesRoot-relative resolution when the file isn't directly there.
  const cwdResolved = resolve(args.template)
  const templatePath =
    existsSync(cwdResolved) || !templatesRoot
      ? cwdResolved
      : resolve(templatesRoot, args.template)

  let fixturePath: string
  try {
    fixturePath = args.data
      ? resolve(args.data)
      : resolveFixture(templatePath, args.fixture)
  } catch (err) {
    emitFailure(err, args.json, templatePath)
    return 1
  }

  const shouldInline = !args.noInlineCss && cfg.inlineCss
  const missingMode: PreviewMissingAs =
    args.missing ?? cfg.previewMissingAs ?? 'error'

  if (missingMode !== 'error') {
    process.stderr.write(
      `note: --missing=${missingMode} — preview diverges from production strict-mode behavior\n`,
    )
  }

  try {
    const { html } = await render(templatePath, fixturePath, {
      templatesRoot,
      previewMissingAs: missingMode,
    })
    const out = shouldInline ? inlineCss(html, cfg.inlineCssOptions) : html
    process.stdout.write(out)
    return 0
  } catch (err) {
    emitFailure(err, args.json, templatePath)
    return 1
  }
}
