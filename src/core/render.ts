import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export interface RenderResult {
  html: string
}

const javaScriptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'java',
  'Render.java',
)

export function render(
  templatePath: string,
  fixturePath: string,
): Promise<RenderResult> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('jbang', [javaScriptPath, templatePath, fixturePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    proc.on('error', rejectP)
    proc.on('close', (code) => {
      if (code === 0) {
        resolveP({ html: stdout })
      } else {
        rejectP(new Error(stderr.trim() || `jbang exited with code ${code}`))
      }
    })
  })
}
