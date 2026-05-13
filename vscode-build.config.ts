import { build, type BuildOptions } from 'esbuild'

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
}

const watch = process.argv.includes('--watch')

if (watch) {
  const { context } = await import('esbuild')
  const ctx = await context(options)
  await ctx.watch()
  console.log('esbuild: watching for changes…')
} else {
  await build(options)
}
