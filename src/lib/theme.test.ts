import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTheme, setThemePreference, THEME_STORAGE_KEY } from './theme'

type ChangeListener = () => void

// jsdom has no matchMedia: a controllable stand-in for the OS colour-scheme setting.
function stubSystemTheme(dark: boolean) {
  const listeners: ChangeListener[] = []
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: ChangeListener) => listeners.push(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (nowDark: boolean) => {
    query.matches = nowDark
    listeners.forEach((listener) => listener())
  }
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('follows the OS by default, including later OS switches', () => {
    const switchSystem = stubSystemTheme(true)
    initTheme()
    expect(isDark()).toBe(true)
    switchSystem(false)
    expect(isDark()).toBe(false)
  })

  it('applies a stored choice over the OS setting', () => {
    stubSystemTheme(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    initTheme()
    expect(isDark()).toBe(false)
  })

  it('ignores an unknown stored value', () => {
    stubSystemTheme(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    initTheme()
    expect(isDark()).toBe(true)
  })

  it('stores an explicit choice and forgets it when going back to system', () => {
    const switchSystem = stubSystemTheme(false)
    initTheme()
    setThemePreference('dark')
    expect(isDark()).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    switchSystem(false)
    expect(isDark()).toBe(true)

    setThemePreference('system')
    expect(isDark()).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('still switches when storage is blocked', () => {
    stubSystemTheme(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    initTheme()
    expect(isDark()).toBe(false)
    setThemePreference('dark')
    expect(isDark()).toBe(true)
  })

  it('turns transitions off for the frame in which the theme switches', () => {
    stubSystemTheme(false)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    initTheme()
    setThemePreference('dark')
    expect(document.documentElement).toHaveClass('theme-switching')
    frames.forEach((callback) => callback(0))
    expect(document.documentElement).not.toHaveClass('theme-switching')
  })

  it('works without matchMedia', () => {
    initTheme()
    expect(isDark()).toBe(false)
  })
})
