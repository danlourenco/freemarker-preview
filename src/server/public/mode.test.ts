import { describe, test, expect } from 'vitest'
import { modeConfig, migrateUrlParams } from './mode.js'

describe('modeConfig', () => {
  test('iOS Mail: 980 virtual viewport, scale to 375, chrome on', () => {
    expect(modeConfig('ios-mail')).toEqual({
      containerWidth: '375px',
      iframeWidth: '980px',
      scale: 375 / 980,
      chrome: true,
    })
  })

  test('Gmail mobile: 375 1:1, no chrome', () => {
    expect(modeConfig('gmail-mobile')).toEqual({
      containerWidth: '375px',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('Desktop: 600 1:1, no chrome', () => {
    expect(modeConfig('desktop')).toEqual({
      containerWidth: '600px',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('Full: 100% 1:1, no chrome', () => {
    expect(modeConfig('full')).toEqual({
      containerWidth: '100%',
      iframeWidth: '100%',
      scale: 1,
      chrome: false,
    })
  })

  test('unknown mode falls back to iOS Mail', () => {
    expect(modeConfig('bogus')).toEqual(modeConfig('ios-mail'))
    expect(modeConfig('')).toEqual(modeConfig('ios-mail'))
    expect(modeConfig(undefined)).toEqual(modeConfig('ios-mail'))
  })
})

describe('migrateUrlParams', () => {
  test('passes through URLs with neither width nor mode', () => {
    expect(migrateUrlParams('http://localhost:5173/?template=hello.ftlh'))
      .toBe('http://localhost:5173/?template=hello.ftlh')
  })

  test('passes through URLs that already have mode set', () => {
    expect(migrateUrlParams('http://localhost:5173/?mode=desktop'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('width=375 migrates to mode=gmail-mobile', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=375'))
      .toBe('http://localhost:5173/?mode=gmail-mobile')
  })

  test('width=600 migrates to mode=desktop', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=600'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('width=full migrates to mode=full', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=full'))
      .toBe('http://localhost:5173/?mode=full')
  })

  test('numeric custom widths migrate to mode=gmail-mobile', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=420'))
      .toBe('http://localhost:5173/?mode=gmail-mobile')
  })

  test('drops stale width when mode is already present', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=375&mode=desktop'))
      .toBe('http://localhost:5173/?mode=desktop')
  })

  test('preserves other query params during migration', () => {
    expect(migrateUrlParams('http://localhost:5173/?template=hello.ftlh&width=600'))
      .toBe('http://localhost:5173/?template=hello.ftlh&mode=desktop')
  })

  test('unknown width values pass through unchanged', () => {
    expect(migrateUrlParams('http://localhost:5173/?width=mobile'))
      .toBe('http://localhost:5173/?width=mobile')
  })
})
