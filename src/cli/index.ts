#!/usr/bin/env node
import { runRender } from './commands/render.ts'
import { runDev } from './commands/dev.ts'

const HELP = `freemarker-preview — FreeMarker template previewer

Usage:
  freemarker-preview dev [--port N] [--no-open]
  freemarker-preview render <template> [--fixture <name>] [--data <fixture.json>] [--json]
  freemarker-preview --help

Commands:
  dev       Start a live-reloading dev server with iframe preview
  render    Render a template against fixture data and write HTML to stdout

Render flags:
  --fixture <name>   Select a fixture by name from <template>.fixtures/
  --data <path>      Explicit fixture path (overrides convention)
  --json             Emit a structured error envelope to stderr on failure

Dev flags:
  --port N           Preferred port (walks +5 if busy). Defaults to 5173.
  --no-open          Do not auto-open the browser
`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return 0
  }

  if (command === 'render') return runRender(rest)
  if (command === 'dev') return runDev(rest)

  process.stderr.write(`unknown command: ${command}\n`)
  process.stderr.write(HELP)
  return 1
}

main(process.argv.slice(2)).then((code) => process.exit(code))
