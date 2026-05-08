import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { render } from '../../core/render.ts'
import { resolveFixture } from '../../core/fixtures.ts'
import { loadConfig } from '../../core/config.ts'
import { FreemarkerError } from '../../core/errors.ts'
import { formatError } from '../../core/format-error.ts'
import { inlineCss } from '../../core/inline.ts'

export interface RenderArgs {
  template: string
  fixture?: string
  data?: string
  json: boolean
  noInlineCss: boolean
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let template: string | undefined
  let fixture: string | undefined
  let data: string | undefined
  let json = false
  let noInlineCss = false

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
    if (!template && arg && !arg.startsWith('--')) {
      template = arg
      i += 1
      continue
    }
    i += 1
  }

  if (!template) throw new Error('render: missing <template> argument')

  return { template, fixture, data, json, noInlineCss }
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

  const templatePath = templatesRoot
    ? resolve(templatesRoot, args.template)
    : resolve(args.template)

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

  try {
    const { html } = await render(templatePath, fixturePath, { templatesRoot })
    const out = shouldInline ? inlineCss(html, cfg.inlineCssOptions) : html
    process.stdout.write(out)
    return 0
  } catch (err) {
    emitFailure(err, args.json, templatePath)
    return 1
  }
}
