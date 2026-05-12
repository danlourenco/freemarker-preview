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
  freemarker-preview render <template> [--data <fixture.json>] [--json]
  freemarker-preview shot <template> [--data <fixture.json>] [--out file.png]
  freemarker-preview --help

Commands:
  init      Register the current project in your user-level registry (interactive picker + JBang pre-warm)
  dev       Start a live-reloading dev server with iframe preview
  render    Render a template against fixture data and write HTML to stdout
  shot      Capture a PNG screenshot of the rendered template

Render flags:
  --data <path>        One-shot fixture override (otherwise uses the
                       per-project fixture from your user registry; falls
                       back to {} when unset)
  --json               Emit a structured error envelope to stderr on failure
  --no-inline-css      Skip the post-render CSS inlining pass
  --missing <mode>     error | placeholder | empty (default: error)

Dev flags:
  --port N             Preferred port (walks +5 if busy). Defaults to 5173.
  --no-open            Do not auto-open the browser
  --missing <mode>     error | placeholder | empty (default: placeholder)

Shot flags:
  --data <path>        One-shot fixture override (otherwise uses the
                       per-project fixture from your user registry)
  --out <file.png>     Output path (defaults to <template>-<timestamp>.png)
  --no-inline-css      Skip the post-render CSS inlining pass

Missing-variable modes:
  error        Default for render. FreeMarker strict mode — undefined
               references throw. Surfaces typos loudly. Right for CI / one-shot
               output going to email pipelines.
  placeholder  Default for dev. Render <span class="fmp-missing">‹path›</span>
               at the reference site. Preview never breaks; missing values are
               visible as red pills inline.
  empty        Replace undefined references with empty strings. Quietest mode;
               useful for screenshot capture of partially-filled fixtures.
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
