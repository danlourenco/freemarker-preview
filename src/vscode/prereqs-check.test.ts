import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { prereqsOkOrWarn } from './prereqs-check.ts'
import { _resetPrereqCache } from '../core/prereqs.ts'

describe('prereqsOkOrWarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetPrereqCache()
  })

  test('returns true when all prereqs are present (this machine has java + jbang)', () => {
    const ok = prereqsOkOrWarn()
    expect(ok).toBe(true)
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled()
  })

  test('returns false and surfaces showErrorMessage when a prereq is missing', () => {
    const originalPath = process.env.PATH
    try {
      process.env.PATH = '/nonexistent-dir-for-prereq-test'
      _resetPrereqCache()

      const ok = prereqsOkOrWarn()

      expect(ok).toBe(false)
      expect(vscode.window.showErrorMessage).toHaveBeenCalled()
      const firstCallArg = (vscode.window.showErrorMessage as unknown as { mock: { calls: string[][] } })
        .mock.calls[0][0]
      expect(firstCallArg).toMatch(/install/i)
    } finally {
      process.env.PATH = originalPath
      _resetPrereqCache()
    }
  })
})
