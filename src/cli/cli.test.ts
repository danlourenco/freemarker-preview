import { describe, test, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const cliEntry = resolve('src/cli/index.ts')

function runCli(args: string[]): Promise<{
  stdout: string
  stderr: string
  code: number | null
}> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      process.execPath,
      ['--no-warnings', cliEntry, ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (c) => (stdout += c))
    proc.stderr.on('data', (c) => (stderr += c))
    proc.on('error', rejectP)
    proc.on('close', (code) => resolveP({ stdout, stderr, code }))
  })
}

describe('cli', () => {
  test('--help lists the render command', async () => {
    const { stdout, code } = await runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout).toMatch(/render/)
  })

  test('render <template> writes html to stdout and exits 0', async () => {
    // assigned-number.ftlh uses <#assign> so it needs no external data
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/assigned-number.ftlh'),
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Pi:')
  })

  test('render renders against an empty data model — undefined variables become placeholder spans', async () => {
    // hello.ftlh uses ${recipient.name} with no <#assign>. The new render
    // API defaults to placeholder mode: missing variables render as inline
    // spans rather than erroring, so the command exits 0.
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/hello.ftlh'),
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('fmp-missing')
  })

  test('render with a parse-error template writes a pretty error with file:line:col + snippet to stderr', async () => {
    // template-parse.ftlh has an unclosed <#if> which is a real parse error
    // (not an undefined-variable — those render as placeholders now).
    const tpl = resolve('fixtures/errors/template-parse.ftlh')
    const { stderr, code } = await runCli([
      'render',
      tpl,
    ])

    expect(code).not.toBe(0)
    expect(stderr).toContain('template-parse')
    expect(stderr).toContain(`${tpl}:`)
    expect(stderr).toMatch(/unclosed #if/i)
    expect(stderr).toMatch(/^>\s*\d+ \|/m)
  })

  test('render --json emits the structured error envelope to stderr', async () => {
    // template-parse.ftlh has an unclosed <#if> — a hard parse error
    const tpl = resolve('fixtures/errors/template-parse.ftlh')
    const { stderr, code } = await runCli([
      'render',
      tpl,
      '--json',
    ])

    expect(code).not.toBe(0)
    const parsed = JSON.parse(stderr) as {
      ok: false
      error: { type: string; templatePath: string; line?: number }
    }
    expect(parsed.ok).toBe(false)
    expect(parsed.error.type).toBe('template-parse')
    expect(parsed.error.templatePath).toBe(tpl)
    expect(parsed.error.line).toBeTypeOf('number')
  })

  test('render --json still writes HTML to stdout on success', async () => {
    // assigned-number.ftlh needs no external data
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/assigned-number.ftlh'),
      '--json',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Pi:')
  })

  test('render inlines CSS by default — child element gets style="..."', async () => {
    // styled.ftlh uses <#assign name = "World"> so it needs no external data
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/styled.ftlh'),
    ])
    expect(code).toBe(0)
    expect(stdout).toMatch(
      /<p[^>]*class="greeting"[^>]*style="[^"]*color: red[^"]*"/,
    )
    // @media is preserved by default
    expect(stdout).toContain('@media (prefers-color-scheme: dark)')
  })

  test('render --no-inline-css keeps the <style> block intact', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/styled.ftlh'),
      '--no-inline-css',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('<style>')
    expect(stdout).toContain('.greeting { color: red')
    expect(stdout).not.toMatch(/<p[^>]*style="/)
  })
})
