export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

export const THEME_STORAGE_KEY = 'qps.theme-mode.v1'

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode)
}

export function readThemeMode(storage: Storage | undefined = browserStorage()): ThemeMode {
  if (!storage) return 'system'
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemeMode(mode: ThemeMode, storage: Storage | undefined = browserStorage()): void {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Theme preference is a convenience and must not block the application.
  }
}

export function resolveTheme(mode: ThemeMode, prefersDark = systemPrefersDark()): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

/**
 * The CSS already owns the light/dark token values. This only chooses which
 * existing token block applies and keeps browser chrome in the same mode.
 */
export function applyThemeMode(
  mode: ThemeMode,
  documentRef: Document | undefined = typeof document === 'undefined' ? undefined : document,
  prefersDark = systemPrefersDark(),
): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark)
  if (!documentRef) return resolved

  documentRef.documentElement.dataset.theme = resolved
  documentRef.documentElement.style.colorScheme = resolved
  documentRef
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0d1c14' : '#f2f7f3')
  return resolved
}
