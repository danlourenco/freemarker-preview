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

  if (fixtureName) {
    throw new Error(
      `--fixture ${fixtureName} given but no fixture directory found at ${fixturesDir}`,
    )
  }

  const sibling = join(dir, `${stem}.json`)
  if (existsSync(sibling)) return sibling

  throw new Error(
    `no fixture found for ${templatePath} (expected ${fixturesDir}/*.json or ${sibling})`,
  )
}
