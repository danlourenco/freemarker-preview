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

  test('auto-coerces ISO-8601 strings in fixture JSON to dates usable in templates', async () => {
    const templatePath = resolve('fixtures/dated.ftlh')
    const fixturePath = resolve('fixtures/dated.json')

    const { html } = await render(templatePath, fixturePath)

    expect(html).toContain('Created: 2025-12-25')
  })

  test('templatesRoot opt sets the FreeMarker loader root so absolute-to-root includes resolve', async () => {
    const templatesRoot = resolve('fixtures/include-test/templates')
    const templatePath = resolve(
      'fixtures/include-test/templates/emails/main.ftlh',
    )
    const fixturePath = resolve('fixtures/include-test/data.json')

    const { html } = await render(templatePath, fixturePath, { templatesRoot })

    expect(html).toContain('Header content')
    expect(html).toContain('Body content for Alice')
  })
})
