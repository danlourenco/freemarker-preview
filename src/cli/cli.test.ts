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

  test('render <template> --data <data> writes html to stdout and exits 0', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/hello.ftlh'),
      '--data',
      resolve('fixtures/hello.json'),
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Hello, World!')
  })

  test('render with a missing fixture exits non-zero', async () => {
    const { code } = await runCli([
      'render',
      resolve('fixtures/hello.ftlh'),
      '--data',
      resolve('fixtures/does-not-exist.json'),
    ])
    expect(code).not.toBe(0)
  })

  test('render with no --data picks alphabetically-first fixture from <template>.fixtures/', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/welcome.ftlh'),
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Welcome, Alice!')
    expect(stdout).toContain('Status: new')
  })

  test('--fixture <name> selects the named fixture from <template>.fixtures/', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/welcome.ftlh'),
      '--fixture',
      'returning-user',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Welcome, Bob!')
    expect(stdout).toContain('Status: returning')
  })

  test('falls back to sibling <template>.json when no .fixtures/ directory exists', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/hello.ftlh'),
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Hello, World!')
  })

  test('render with a typo template writes a pretty error with file:line:col + snippet to stderr', async () => {
    const tpl = resolve('fixtures/errors/undefined-variable.ftlh')
    const { stderr, code } = await runCli([
      'render',
      tpl,
      '--data',
      resolve('fixtures/errors/undefined-variable.json'),
    ])

    expect(code).not.toBe(0)
    expect(stderr).toContain('undefined-variable')
    expect(stderr).toContain(`${tpl}:`)
    expect(stderr).toMatch(/recipient\.naem/)
    expect(stderr).toMatch(/^>\s*\d+ \|/m)
  })

  test('render --json emits the structured error envelope to stderr', async () => {
    const tpl = resolve('fixtures/errors/undefined-variable.ftlh')
    const { stderr, code } = await runCli([
      'render',
      tpl,
      '--data',
      resolve('fixtures/errors/undefined-variable.json'),
      '--json',
    ])

    expect(code).not.toBe(0)
    const parsed = JSON.parse(stderr) as {
      ok: false
      error: { type: string; templatePath: string; line?: number }
    }
    expect(parsed.ok).toBe(false)
    expect(parsed.error.type).toBe('undefined-variable')
    expect(parsed.error.templatePath).toBe(tpl)
    expect(parsed.error.line).toBeTypeOf('number')
  })

  test('render --json still writes HTML to stdout on success', async () => {
    const { stdout, code } = await runCli([
      'render',
      resolve('fixtures/hello.ftlh'),
      '--data',
      resolve('fixtures/hello.json'),
      '--json',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('Hello, World!')
  })

  test('render inlines CSS by default — child element gets style="..."', async () => {
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
