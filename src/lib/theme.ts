import { useSyncExternalStore } from 'react'

// Light/dark mode. The user's choice (or "system", the default: follow the OS) is kept in localStorage, which
// only ever holds this display preference. The resolved mode is the `dark` class on <html> (see tokens.css).

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()
let preference: ThemePreference = 'system'

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false
}

function apply() {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

// Switches without animating: otherwise every transition-colors element fades through muddy in-between colours.
function applyWithoutTransitions() {
  const root = document.documentElement
  root.classList.add('theme-switching')
  apply()
  void getComputedStyle(root).color
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

// Call once before the first render, so the page never paints in the wrong mode.
export function initTheme() {
  preference = readStoredPreference()
  apply()
  window.matchMedia?.(DARK_QUERY).addEventListener('change', () => {
    if (preference === 'system') applyWithoutTransitions()
    listeners.forEach((listener) => listener())
  })
}

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage blocked (private mode, policy): the choice still applies for this page load.
  }
  applyWithoutTransitions()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference)
}

// The mode actually showing; changes when the OS switches while the preference is "system".
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, () =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
}
