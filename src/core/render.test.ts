import { describe, test, expect } from 'vitest'
import { render } from './render.ts'
import { FreemarkerError } from './errors.ts'
import { resolve } from 'node:path'

describe('core.render', () => {
  test('renders a template against an empty data model', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')

    const { html } = await render(templatePath)

    expect(html).toContain('Hello, ')
    // hello.ftlh references ${recipient.name}; without data it renders as a placeholder.
    expect(html).toMatch(/<span\s+class="fmp-missing"/)
    expect(html).toContain('‹recipient›')
  })

  test('templatesRoot opt sets the FreeMarker loader root so absolute-to-root includes resolve', async () => {
    const templatesRoot = resolve('fixtures/include-test/templates')
    const templatePath = resolve(
      'fixtures/include-test/templates/emails/main.ftlh',
    )

    const { html } = await render(templatePath, { templatesRoot })

    expect(html).toContain('Header content')
    // The body template references variables; renders as placeholder.
    expect(html).toMatch(/<span\s+class="fmp-missing"/)
  })

  test('rejects with FreemarkerError(template-parse) for malformed template syntax', async () => {
    const templatePath = resolve('fixtures/errors/template-parse.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-parse',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-not-found) for a missing template', async () => {
    const templatePath = resolve('fixtures/does-not-exist.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-not-found',
    } satisfies Partial<FreemarkerError>)
  })

  test('rejects with FreemarkerError(template-runtime) for runtime template errors', async () => {
    const templatePath = resolve('fixtures/errors/template-runtime.ftlh')

    await expect(render(templatePath)).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'template-runtime',
      templatePath,
    } satisfies Partial<FreemarkerError>)
  })

  test('freemarkerSettings forwards Configuration.setSetting() values to the Java side', async () => {
    // Uses fixtures/assigned-number.ftlh — assigns a numeric literal inside
    // the template via <#assign>, so output is affected by number_format
    // even without any fixture data.
    const templatePath = resolve('fixtures/assigned-number.ftlh')

    const { html: defaultOut } = await render(templatePath)
    const { html: customOut } = await render(templatePath, {
      freemarkerSettings: { number_format: '0' },
    })

    // Default en_US locale with number_format="number" renders 1.234567 to exactly "1.235".
    // number_format='0' formats it as an integer.
    expect(defaultOut).toContain('Pi: 1.235')
    expect(customOut).toContain('Pi: 1')
    expect(customOut).not.toMatch(/1[.,]\d{2,}/)
  })

  test('rejects with FreemarkerError(internal) when jbang fails to produce a parseable envelope', async () => {
    const templatePath = resolve('fixtures/hello.ftlh')

    await expect(
      render(templatePath, {
        javaScriptPath: '/nonexistent/Render.java',
      }),
    ).rejects.toMatchObject({
      name: 'FreemarkerError',
      type: 'internal',
    } satisfies Partial<FreemarkerError>)
  })
})
