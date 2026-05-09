import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { detectProjectLayout } from '../../core/detect.ts'
import { render } from '../../core/render.ts'

export interface InitArgs {
  force: boolean
  noWarmup: boolean
}

export function parseInitArgs(argv: string[]): InitArgs {
  let force = false
  let noWarmup = false
  for (const arg of argv) {
    if (arg === '--force') force = true
    else if (arg === '--no-warmup') noWarmup = true
  }
  return { force, noWarmup }
}

export async function runInit(argv: string[]): Promise<number> {
  const args = parseInitArgs(argv)
  const cwd = process.cwd()
  const configPath = resolve(cwd, '.freemarkerrc.json')

  if (existsSync(configPath) && !args.force) {
    process.stderr.write(
      `init: ${configPath} already exists. Use --force to overwrite.\n`,
    )
    return 1
  }

  const layout = detectProjectLayout(cwd)
  // Compute templatesRoot relative to cwd (where the config will be written).
  // - If we found a templates dir, use the relative path from cwd to it. If
  //   the user is already inside that dir, the result is "." which `dev` and
  //   `render` resolve correctly.
  // - If no templates dir was detected (no Spring Boot, or SB without
  //   matching dirs), default to "." rather than a hardcoded placeholder so
  //   the config is at least usable from where it was written.
  const templatesRoot = layout.templatesDir
    ? relative(cwd, layout.templatesDir) || '.'
    : '.'
  const config = {
    templatesRoot,
    locale: 'en_US',
    inlineCss: true,
    dev: { port: 5173, open: true },
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  process.stdout.write(`wrote ${configPath}\n`)
  process.stdout.write(`  templatesRoot: ${templatesRoot}\n`)

  if (layout.kind === 'spring-boot' && layout.projectRoot) {
    process.stdout.write(
      `  detected: Spring Boot project at ${layout.projectRoot}\n`,
    )
  }
  if (!layout.templatesDir) {
    process.stdout.write(
      `  note: no templates directory detected — defaulted to "." (cwd).\n` +
        `        edit .freemarkerrc.json if your templates live elsewhere.\n`,
    )
  }

  if (!args.noWarmup) {
    try {
      await prewarmJBang()
      process.stdout.write(`  pre-warmed JBang FreeMarker dep cache\n`)
    } catch (err) {
      process.stderr.write(
        `  warning: JBang pre-warm failed (${(err as Error).message}). ` +
          `First render will pay the cold-start cost.\n`,
      )
    }
  }

  return 0
}

/**
 * Render a tiny no-op template once so JBang fetches the FreeMarker JAR
 * into its dep cache. Run from a temp dir so we don't pollute cwd.
 */
async function prewarmJBang(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'fmp-warmup-'))
  try {
    const tplPath = join(dir, 'warmup.ftlh')
    const fixPath = join(dir, 'warmup.json')
    writeFileSync(tplPath, 'ok\n', 'utf8')
    writeFileSync(fixPath, '{}', 'utf8')
    await render(tplPath, fixPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
