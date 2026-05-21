#!/usr/bin/env node
import { runRender } from './commands/render.ts'
import { runDev } from './commands/dev.ts'
import { runShot } from './commands/shot.ts'
import { runInit } from './commands/init.ts'
import { ensurePrerequisites } from '../core/prereqs.ts'

const HELP = `freemarker-preview — FreeMarker template previewer

Usage:
  freemarker-preview init [--force] [--no-warmup]
  freemarker-preview dev [--port N] [--no-open]
  freemarker-preview render <template> [--json] [--no-inline-css]
  freemarker-preview shot <template> [--out file.png] [--no-inline-css]
  freemarker-preview --help

Commands:
  init      Register the current project in your user-level registry (interactive picker + JBang pre-warm)
  dev       Start a live-reloading dev server with iframe preview
  render    Render a template and write HTML to stdout
  shot      Capture a PNG screenshot of the rendered template

Render flags:
  --json               Emit a structured error envelope to stderr on failure
  --no-inline-css      Skip the post-render CSS inlining pass

Dev flags:
  --port N             Preferred port (walks +5 if busy). Defaults to 5173.
  --no-open            Do not auto-open the browser

Shot flags:
  --out <file.png>     Output path (defaults to <template>-<timestamp>.png)
  --no-inline-css      Skip the post-render CSS inlining pass

Variable rendering:
  Templates render against an empty data model. Any variable reference appears
  inline as a styled \`‹varName›\` placeholder (<span class="fmp-variable">),
  so missing references never break the preview.
`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return 0
  }

  if (
    command === 'init' ||
    command === 'render' ||
    command === 'dev' ||
    command === 'shot'
  ) {
    ensurePrerequisites()
  }

  if (command === 'init') return runInit(rest)
  if (command === 'render') return runRender(rest)
  if (command === 'dev') return runDev(rest)
  if (command === 'shot') return runShot(rest)

  process.stderr.write(`unknown command: ${command}\n`)
  process.stderr.write(HELP)
  return 1
}

main(process.argv.slice(2)).then((code) => process.exit(code))
