import { dirname, resolve } from 'node:path'
import { render } from '../../core/render.ts'
import { resolveFixture } from '../../core/fixtures.ts'
import { loadConfig } from '../../core/config.ts'

export interface RenderArgs {
  template: string
  fixture?: string
  data?: string
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let template: string | undefined
  let fixture: string | undefined
  let data: string | undefined

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--data') {
      data = argv[i + 1]
      i += 2
      continue
    }
    if (arg === '--fixture') {
      fixture = argv[i + 1]
      i += 2
      continue
    }
    if (!template && arg && !arg.startsWith('--')) {
      template = arg
      i += 1
      continue
    }
    i += 1
  }

  if (!template) throw new Error('render: missing <template> argument')

  return { template, fixture, data }
}

export async function runRender(argv: string[]): Promise<number> {
  let args: RenderArgs
  try {
    args = parseRenderArgs(argv)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  let cfg
  try {
    cfg = loadConfig(process.cwd())
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  const templatesRoot =
    cfg.templatesRoot && cfg.configPath
      ? resolve(dirname(cfg.configPath), cfg.templatesRoot)
      : undefined

  const templatePath = templatesRoot
    ? resolve(templatesRoot, args.template)
    : resolve(args.template)

  let fixturePath: string
  try {
    fixturePath = args.data
      ? resolve(args.data)
      : resolveFixture(templatePath, args.fixture)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  try {
    const { html } = await render(templatePath, fixturePath, { templatesRoot })
    process.stdout.write(html)
    return 0
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }
}
