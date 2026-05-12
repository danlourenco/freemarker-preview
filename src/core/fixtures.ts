import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export function resolveFixture(
  templatePath: string,
  fixtureName?: string,
): string {
  const dir = dirname(templatePath)
  const stem = basename(templatePath, extname(templatePath))
  const fixturesDir = join(dir, `${stem}.fixtures`)

  if (existsSync(fixturesDir) && statSync(fixturesDir).isDirectory()) {
    const candidates = readdirSync(fixturesDir)
      .filter((f) => f.endsWith('.json'))
      .sort()

    if (candidates.length === 0) {
      throw new Error(`fixture directory exists but is empty: ${fixturesDir}`)
    }

    if (fixtureName) {
      const match = `${fixtureName}.json`
      if (!candidates.includes(match)) {
        throw new Error(
          `fixture not found: ${fixtureName} in ${fixturesDir} (available: ${candidates.map((c) => c.replace(/\.json$/, '')).join(', ')})`,
        )
      }
      return join(fixturesDir, match)
    }

    return join(fixturesDir, candidates[0]!)
  }

  // No .fixtures/ directory. Fall back to a sibling JSON.
  // - If fixtureName given: try <dir>/<fixtureName>.json
  // - Otherwise: try <dir>/<template-stem>.json
  const siblingName = fixtureName ?? stem
  const sibling = join(dir, `${siblingName}.json`)
  if (existsSync(sibling)) return sibling

  if (fixtureName) {
    throw new Error(
      `--fixture ${fixtureName} given but no fixture directory at ${fixturesDir} and no sibling ${sibling}`,
    )
  }
  throw new Error(
    `no fixture found for ${templatePath} (expected ${fixturesDir}/*.json or ${sibling})`,
  )
}

export interface ResolvedFixture {
  path: string
  /** True when no fixture exists and the empty fallback is being used. */
  fallback: boolean
}

/**
 * Like {@link resolveFixture}, but when no fixture exists *and* the caller
 * didn't ask for a specific one, returns `emptyFallback` (a pre-written
 * `{}.json`) instead of throwing. An explicit fixtureName that can't be
 * resolved still throws — the user asked for a specific thing and we
 * shouldn't silently substitute.
 *
 * Used by the dev server so templates without fixtures still render with
 * empty data plus visible missing-variable pills, instead of blocking the
 * whole preview behind a fixture-read error.
 */
export function resolveFixtureOrEmpty(
  templatePath: string,
  fixtureName: string | undefined,
  emptyFallback: string,
): ResolvedFixture {
  try {
    return { path: resolveFixture(templatePath, fixtureName), fallback: false }
  } catch (err) {
    if (fixtureName) throw err
    return { path: emptyFallback, fallback: true }
  }
}
