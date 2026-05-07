import { render } from '../../core/render.ts'

export interface RenderArgs {
  template: string
  data: string
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let template: string | undefined
  let data: string | undefined

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--data') {
      data = argv[i + 1]
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
  if (!data) throw new Error('render: missing --data <fixture.json>')

  return { template, data }
}

export async function runRender(argv: string[]): Promise<number> {
  let args: RenderArgs
  try {
    args = parseRenderArgs(argv)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }

  try {
    const { html } = await render(args.template, args.data)
    process.stdout.write(html)
    return 0
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }
}
