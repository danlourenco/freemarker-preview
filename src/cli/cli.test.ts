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
    const proc = spawn(process.execPath, [cliEntry, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
})
