import { useEffect, useState } from 'react'
import { applyThemeMode, readThemeMode, resolveTheme, saveThemeMode, type ResolvedTheme, type ThemeMode } from '@/app/theme/theme'

export function useThemeMode(): Readonly<{
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}> {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(mode))

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => setResolvedTheme(applyThemeMode(mode, document, mediaQuery?.matches === true))
    apply()

    if (mode !== 'system' || !mediaQuery) return undefined
    mediaQuery.addEventListener?.('change', apply)
    return () => mediaQuery.removeEventListener?.('change', apply)
  }, [mode])

  function setMode(nextMode: ThemeMode) {
    saveThemeMode(nextMode)
    setModeState(nextMode)
  }

  return { mode, resolvedTheme, setMode }
}
