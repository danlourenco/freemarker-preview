import { build, type BuildOptions } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

const options: BuildOptions = {
  entryPoints: ['src/vscode/extension.ts'],
  bundle: true,
  outfile: 'dist/vscode/extension.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
  logOverride: { 'empty-import-meta': 'silent' },
}

function copyAssets() {
  mkdirSync('dist/vscode/java', { recursive: true })
  cpSync('src/core/java', 'dist/vscode/java', { recursive: true })
}

const watch = process.argv.includes('--watch')

if (watch) {
  const { context } = await import('esbuild')
  const ctx = await context(options)
  copyAssets()
  await ctx.watch()
  console.log('esbuild: watching for changes…')
} else {
  await build(options)
  copyAssets()
}
