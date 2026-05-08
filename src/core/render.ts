import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, basename, relative, resolve } from 'node:path'
import { FreemarkerError, type StructuredError } from './errors.ts'
import { debugLog } from './debug-log.ts'

export interface RenderOptions {
  templatesRoot?: string
  /**
   * Override the path to Render.java. Used when the bundled location differs
   * from the source-tree location (e.g. installed npm package, VS Code
   * extension shipping a different layout).
   */
  javaScriptPath?: string
}

export interface RenderResult {
  html: string
}

const DEFAULT_JAVA_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'java',
  'Render.java',
)

interface SuccessEnvelope {
  ok: true
  html: string
}

interface ErrorEnvelope {
  ok: false
  error: StructuredError
}

type Envelope = SuccessEnvelope | ErrorEnvelope

export function render(
  templatePath: string,
  fixturePath: string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const templatesRoot = opts.templatesRoot
    ? resolve(opts.templatesRoot)
    : dirname(templatePath)
  const templateName = opts.templatesRoot
    ? relative(templatesRoot, templatePath)
    : basename(templatePath)

  const scriptPath = opts.javaScriptPath ?? DEFAULT_JAVA_SCRIPT_PATH

  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      'jbang',
      [scriptPath, templatesRoot, templateName, fixturePath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

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
      if (code !== 0) {
        rejectP(
          new FreemarkerError({
            type: 'internal',
            message: stderr.trim() || `jbang exited with code ${code}`,
            templatePath,
          }),
        )
        return
      }

      let envelope: Envelope
      try {
        envelope = JSON.parse(stdout) as Envelope
      } catch {
        rejectP(
          new FreemarkerError({
            type: 'internal',
            message: `unparseable response from jbang: ${stdout.slice(0, 200)}`,
            templatePath,
          }),
        )
        return
      }

      if (envelope.ok) {
        resolveP({ html: envelope.html })
      } else {
        if (envelope.error.stack) {
          debugLog(
            `render failed (${envelope.error.type}) for ${envelope.error.templatePath}\n${envelope.error.stack}`,
          )
        }
        rejectP(new FreemarkerError(envelope.error))
      }
    })
  })
}
