import { describe, test, expect } from 'vitest'
import { render } from './render.ts'
import { resolve } from 'node:path'

describe('core.render', () => {
  test('renders a template against fixture data', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')
    const fixturePath = resolve('fixtures/hello.json')

    const { html } = await render(templatePath, fixturePath)

    expect(html).toContain('Hello, World!')
  })
})
