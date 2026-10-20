import { beforeEach, describe, expect, it } from 'vitest'
import { applyThemeMode, readThemeMode, resolveTheme, saveThemeMode, THEME_STORAGE_KEY } from './theme'

describe('theme preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.removeProperty('color-scheme')
    const themeColor = document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(
      Object.assign(document.createElement('meta'), { name: 'theme-color' }),
    )
    themeColor.setAttribute('content', '#0f172a')
  })

  it('defaults to System and ignores an invalid stored value', () => {
    expect(readThemeMode()).toBe('system')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readThemeMode()).toBe('system')
  })

  it('persists a valid user preference outside the operational store', () => {
    saveThemeMode('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemeMode()).toBe('dark')
  })

  it('resolves System from the device preference and applies the existing theme selector globally', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(applyThemeMode('system', document, true)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0d1c14')

    applyThemeMode('light', document, true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f2f7f3')
  })
})
