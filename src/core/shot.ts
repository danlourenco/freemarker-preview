/**
 * Screenshot via Playwright. Module is import()'d lazily by callers so
 * `freemarker-preview render` never pulls Playwright into the dep graph.
 */

export interface ShotOptions {
  /** Viewport width in pixels. Defaults to 600. */
  width?: number
  /** Capture the full scrollable page (default) vs. only the viewport. */
  fullPage?: boolean
  /** Image format. Defaults to 'png'. */
  format?: 'png' | 'jpeg'
}

export class PlaywrightMissingError extends Error {
  override readonly name = 'PlaywrightMissingError'
  readonly suggestedCommand: string

  constructor(message: string, suggestedCommand: string) {
    super(message)
    this.suggestedCommand = suggestedCommand
  }
}

export async function shoot(
  html: string,
  opts: ShotOptions = {},
): Promise<Buffer> {
  const width = opts.width ?? 600
  const fullPage = opts.fullPage ?? true
  const format = opts.format ?? 'png'

  let playwright: typeof import('playwright')
  try {
    playwright = await import('playwright')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new PlaywrightMissingError(
        'playwright is not installed. shot requires playwright to capture screenshots.',
        'npm install playwright && npx playwright install chromium',
      )
    }
    throw err
  }

  let browser
  try {
    browser = await playwright.chromium.launch({ headless: true })
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes("Executable doesn't exist") || msg.includes('install')) {
      throw new PlaywrightMissingError(
        "Chromium isn't installed for Playwright. Run the suggested command and retry.",
        'npx playwright install chromium',
      )
    }
    throw err
  }

  try {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const buf = await page.screenshot({ fullPage, type: format })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}
