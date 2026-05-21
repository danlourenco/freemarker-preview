import { basename, extname, resolve } from 'node:path'
import { writeFile, readFileSync, existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { render } from '../../core/render.ts'
import { loadConfig } from '../../core/config.ts'
import { FreemarkerError } from '../../core/errors.ts'
import { formatError } from '../../core/format-error.ts'
import { inlineCss } from '../../core/inline.ts'

const writeFileP = promisify(writeFile)

export interface ShotArgs {
  template: string
  out?: string
  noInlineCss: boolean
}

export function parseShotArgs(argv: string[]): ShotArgs {
  let template: string | undefined
  let out: string | undefined
  let noInlineCss = false

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--out')     { out = argv[i + 1];     i += 2; continue }
    if (arg === '--no-inline-css') { noInlineCss = true; i += 1; continue }
    if (!template && arg && !arg.startsWith('--')) {
      template = arg
      i += 1
      continue
    }
    i += 1
  }

  if (!template) throw new Error('shot: missing <template> argument')
  return { template, out, noInlineCss }
}

/**
 * Default output filename: <template-stem>-<timestamp>.png.
 * Timestamp is local-time ISO basic form (YYYYMMDDTHHmmss) — filesystem-safe
 * (no colons, lexicographically sortable).
 */
export function defaultOutputPath(
  templatePath: string,
  now: Date = new Date(),
): string {
  const stem = basename(templatePath, extname(templatePath))
  return `${stem}-${formatTimestamp(now)}.png`
}

function formatTimestamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}` +
    `${pad(d.getMonth() + 1)}` +
    `${pad(d.getDate())}` +
    `T` +
    `${pad(d.getHours())}` +
    `${pad(d.getMinutes())}` +
    `${pad(d.getSeconds())}`
  )
}

export async function runShot(argv: string[]): Promise<number> {
  let args: ShotArgs
  try {
    args = parseShotArgs(argv)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  const cfg = loadConfig(process.cwd())
  const templatesRoot = cfg.templatesRoot
    ? resolve(cfg.projectRoot, cfg.templatesRoot)
    : undefined

  const cwdResolved = resolve(args.template)
  const templatePath =
    existsSync(cwdResolved) || !templatesRoot
      ? cwdResolved
      : resolve(templatesRoot, args.template)

  const shouldInline = !args.noInlineCss && cfg.inlineCss
  const outPath = resolve(args.out ?? defaultOutputPath(templatePath))

  let html: string
  try {
    const result = await render(templatePath, {
      templatesRoot,
      freemarkerSettings: cfg.freemarker,
    })
    html = shouldInline ? inlineCss(result.html, cfg.inlineCssOptions) : result.html
  } catch (err) {
    if (err instanceof FreemarkerError) {
      let source: string | undefined
      try { source = readFileSync(err.templatePath, 'utf8') } catch { /* ignore */ }
      const colors = process.stderr.isTTY ?? false
      process.stderr.write(`${formatError(err, source, { colors })}\n`)
    } else {
      process.stderr.write(`${(err as Error).message}\n`)
    }
    return 1
  }

  // Lazy import the screenshot module so a stripped install (no playwright)
  // can still run `render` without paying the import cost.
  let shoot: typeof import('../../core/shot.ts').shoot
  let PlaywrightMissingError: typeof import('../../core/shot.ts').PlaywrightMissingError
  try {
    const mod = await import('../../core/shot.ts')
    shoot = mod.shoot
    PlaywrightMissingError = mod.PlaywrightMissingError
  } catch (err) {
    process.stderr.write(`failed to load screenshot module: ${(err as Error).message}\n`)
    return 1
  }

  try {
    const buf = await shoot(html, { width: 600, fullPage: true, format: 'png' })
    await writeFileP(outPath, buf)
    process.stdout.write(`${outPath}\n`)
    return 0
  } catch (err) {
    if (err instanceof PlaywrightMissingError) {
      process.stderr.write(`${err.message}\n  fix: ${err.suggestedCommand}\n`)
    } else {
      process.stderr.write(`shot failed: ${(err as Error).message}\n`)
    }
    return 1
  }
}
