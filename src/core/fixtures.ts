import { writeFileSync } from 'node:fs'

/**
 * Materialize the per-project inline fixture (from the user registry) to
 * a temp file the JBang renderer can read. JBang's render entrypoint
 * takes a fixture *path*, so we serialize the object once per render.
 *
 * Lives in src/core/fixtures.ts as the only fixture-related concern left
 * in the codebase. The old per-template conventions (`<template>.fixtures/`
 * directory and `<template>.json` sibling) were removed in the registry-
 * fixture redesign — fixture data lives with the config now, not in the
 * project tree.
 */
export function materializeFixture(
  data: Record<string, unknown> | null,
  targetPath: string,
): string {
  const payload = data ?? {}
  writeFileSync(targetPath, JSON.stringify(payload), 'utf8')
  return targetPath
}
