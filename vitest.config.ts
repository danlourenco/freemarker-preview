import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    alias: {
      vscode: fileURLToPath(new URL('./src/vscode/__test__/vscode-stub.ts', import.meta.url)),
    },
  },
})
