#!/usr/bin/env node
import { runRender } from './commands/render.ts'

const HELP = `freemarker-preview — FreeMarker template previewer

Usage:
  freemarker-preview render <template> --data <fixture.json>
  freemarker-preview --help

Commands:
  render    Render a template against fixture data and write HTML to stdout
`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return 0
  }

  if (command === 'render') {
    return runRender(rest)
  }

  process.stderr.write(`unknown command: ${command}\n`)
  process.stderr.write(HELP)
  return 1
}

main(process.argv.slice(2)).then((code) => process.exit(code))
