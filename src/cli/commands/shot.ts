import { dirname, basename, extname, resolve } from 'node:path'
import { writeFile, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { render, type PreviewMissingAs } from '../../core/render.ts'
import { resolveFixture } from '../../core/fixtures.ts'
import { loadConfig } from '../../core/config.ts'
import { FreemarkerError } from '../../core/errors.ts'
import { formatError } from '../../core/format-error.ts'
import { inlineCss } from '../../core/inline.ts'

const writeFileP = promisify(writeFile)

export interface ShotArgs {
  template: string
  fixture?: string
  data?: string
  out?: string
  noInlineCss: boolean
}

export function parseShotArgs(argv: string[]): ShotArgs {
  let template: string | undefined
  let fixture: string | undefined
  let data: string | undefined
  let out: string | undefined
  let noInlineCss = false

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--fixture') { fixture = argv[i + 1]; i += 2; continue }
    if (arg === '--data')    { data = argv[i + 1];    i += 2; continue }
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
  return { template, fixture, data, out, noInlineCss }
}

/**
 * Default output filename: <template-stem>[-<fixture-name>]-<timestamp>.png.
 * Timestamp is local-time ISO basic form (YYYYMMDDTHHmmss) — filesystem-safe
 * (no colons, lexicographically sortable). When the fixture is the
 * sibling-fallback (basename equals template stem), the fixture suffix is
 * omitted.
 */
export function defaultOutputPath(
  templatePath: string,
  fixturePath: string,
  now: Date = new Date(),
): string {
  const tplStem = basename(templatePath, extname(templatePath))
  const fixStem = basename(fixturePath, extname(fixturePath))
  const stem = tplStem === fixStem ? tplStem : `${tplStem}-${fixStem}`
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
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  const missingMode: PreviewMissingAs = cfg.previewMissingAs ?? 'error'
  const shouldInline = !args.noInlineCss && cfg.inlineCss
  const outPath = resolve(args.out ?? defaultOutputPath(templatePath, fixturePath))

  let html: string
  try {
    const result = await render(templatePath, fixturePath, {
      templatesRoot,
      previewMissingAs: missingMode,
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
