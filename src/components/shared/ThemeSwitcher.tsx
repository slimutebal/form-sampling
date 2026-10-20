import { useEffect, useRef, useState } from 'react'
import { Moon, Smartphone, Sun, type LucideIcon } from 'lucide-react'
import { useThemeMode } from '@/app/theme/useThemeMode'
import type { ThemeMode } from '@/app/theme/theme'
import { cn } from '@/components/ui/cn'

const themeOptions: readonly { readonly mode: ThemeMode; readonly label: string; readonly Icon: LucideIcon }[] = [
  { mode: 'light', label: 'Light', Icon: Moon },
  { mode: 'dark', label: 'Dark', Icon: Sun },
  { mode: 'system', label: 'System', Icon: Smartphone },
]

/** Compact Settings popover. Its host header decides placement so it never
 * occupies operational content or competes with the floating Add control. */
export function ThemeSwitcher({ className }: Readonly<{ className?: string }>) {
  const { mode, setMode } = useThemeMode()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const CurrentModeIcon = themeOptions.find((option) => option.mode === mode)?.Icon ?? Smartphone
  const currentModeLabel = themeOptions.find((option) => option.mode === mode)?.label ?? 'System'

  useEffect(() => {
    function closeWhenOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div ref={rootRef} data-ui="theme-switcher" className={cn('relative shrink-0', className)}>
      {open ? (
        <div data-ui="theme-switcher-menu" role="menu" aria-label="Settings" className="ui-action-menu absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-1rem)] w-36 overflow-y-auto p-1">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Appearance</p>
          {themeOptions.filter((option) => option.mode !== mode).map(({ mode: optionMode, label, Icon }) => (
            <button
              key={optionMode}
              type="button"
              role="menuitem"
              aria-label={`Switch to ${label} theme`}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setMode(optionMode)
                setOpen(false)
              }}
            >
              <Icon aria-hidden="true" data-ui="theme-mode-icon" data-theme-mode={optionMode} size={15} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Settings"
        aria-description={`Current theme ${currentModeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Appearance settings — ${currentModeLabel}`}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-accent/60"
        onClick={() => setOpen((value) => !value)}
      >
        <CurrentModeIcon aria-hidden="true" data-ui="theme-current-mode-icon" data-theme-mode={mode} size={14} />
      </button>
    </div>
  )
}
