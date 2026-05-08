import { describe, test, expect } from 'vitest'
import { render } from './render.ts'
import { FreemarkerError } from './errors.ts'
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

  test('rejects with FreemarkerError(undefined-variable) for a typo reference', async () => {
    const templatePath = resolve('fixtures/errors/undefined-variable.ftlh')
    const fixturePath = resolve('fixtures/errors/undefined-variable.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'undefined-variable',
      line: expect.any(Number),
      column: expect.any(Number),
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-parse) for malformed template syntax', async () => {
    const templatePath = resolve('fixtures/errors/template-parse.ftlh')
    const fixturePath = resolve('fixtures/hello.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-parse',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-not-found) for a missing template', async () => {
    const templatePath = resolve('fixtures/does-not-exist.ftlh')
    const fixturePath = resolve('fixtures/hello.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-not-found',
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-runtime) for runtime template errors', async () => {
    const templatePath = resolve('fixtures/errors/template-runtime.ftlh')
    const fixturePath = resolve('fixtures/errors/template-runtime.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-runtime',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(fixture-read) for a missing fixture file', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')
    const fixturePath = resolve('fixtures/does-not-exist.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'fixture-read',
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(fixture-parse) for malformed fixture JSON', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')
    const fixturePath = resolve('fixtures/errors/fixture-parse.json')

    await expect(render(templatePath, fixturePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'fixture-parse',
    } satisfies Partial<FreemarkerError>)
  })

  test('previewMissingAs: placeholder renders a fmp-missing span instead of throwing', async () => {
    const templatePath = resolve('fixtures/errors/undefined-variable.ftlh')
    const fixturePath = resolve('fixtures/errors/undefined-variable.json')

    const { html } = await render(templatePath, fixturePath, {
      previewMissingAs: 'placeholder',
    })

    expect(html).toMatch(/<span\s+class="fmp-missing"/)
    expect(html).toContain('recipient.naem')
    expect(html).toContain('‹')
    expect(html).toContain('›')
  })

  test('previewMissingAs: empty renders an empty string at the missing reference site', async () => {
    const templatePath = resolve('fixtures/errors/undefined-variable.ftlh')
    const fixturePath = resolve('fixtures/errors/undefined-variable.json')

    const { html } = await render(templatePath, fixturePath, {
      previewMissingAs: 'empty',
    })

    expect(html).toContain('Hello, !')
    expect(html).not.toContain('fmp-missing')
  })

  test('rejects with FreemarkerError(internal) when jbang fails to produce a parseable envelope', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')
    const fixturePath = resolve('fixtures/hello.json')

    await expect(
      render(templatePath, fixturePath, {
        javaScriptPath: '/nonexistent/Render.java',
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'internal',
    } satisfies Partial<FreemarkerError>)
  })
})
