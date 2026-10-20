import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/components/ui/cn'

export interface CustomSelectOption { readonly value: string; readonly label: string; readonly disabled?: boolean }
interface CustomSelectProps {
  readonly id?: string; readonly ariaLabel: string; readonly value: string; readonly options: readonly CustomSelectOption[]; readonly placeholder: string
  readonly disabled?: boolean; readonly invalid?: boolean; readonly describedBy?: string; readonly className?: string; readonly preferAbove?: boolean
  readonly menuBoundaryRef?: RefObject<HTMLElement | null>; readonly viewportOnly?: boolean; readonly onChange: (value: string) => void
}
type MenuPosition = Readonly<{ left: number; top: number; width: number; maxHeight: number }>

function getMenuPosition(anchor: HTMLElement, boundary?: HTMLElement | null, viewportOnly = false, preferAbove = false): MenuPosition {
  const rect = anchor.getBoundingClientRect()
  const visual = window.visualViewport
  const viewportTop = visual?.offsetTop ?? 0
  const viewportBottom = viewportTop + (visual?.height ?? window.innerHeight)
  const boundaryRect = viewportOnly ? undefined : boundary?.getBoundingClientRect()
  const top = Math.max(viewportTop + 8, boundaryRect?.top ?? viewportTop + 8)
  const bottom = Math.min(viewportBottom - 8, boundaryRect?.bottom ?? viewportBottom - 8)
  const above = Math.max(0, rect.top - top)
  const below = Math.max(0, bottom - rect.bottom)
  const upward = preferAbove ? above >= 48 : above >= 48 && (above >= 80 || below < 80)
  const height = Math.max(44, Math.min(256, (upward ? above : below) - 4))
  const left = Math.max(8, rect.left)
  // A company name should never be constrained to the half-width trigger.
  const width = Math.min(Math.max(rect.width, 240), window.innerWidth - left - 8)
  return { left, top: upward ? Math.max(top, rect.top - height - 4) : rect.bottom + 4, width, maxHeight: height }
}

/** A selectable master-data value: editable query, committed option ID, one visible control border. */
export function CustomSelect({ id, ariaLabel, value, options, placeholder, disabled = false, invalid = false, describedBy, className, preferAbove = false, menuBoundaryRef, viewportOnly = false, onChange }: CustomSelectProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-options`
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState<MenuPosition>()
  const selected = options.find((option) => option.value === value)
  // A committed parent value always wins over an in-progress filter. This avoids
  // keeping an unvalidated query visible after an external selection change.
  const displayValue = isFiltering && !value ? query : (selected?.label ?? '')
  const matching = useMemo(() => isFiltering ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()) || option.value.toLowerCase().includes(query.trim().toLowerCase())) : options, [isFiltering, options, query])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false); setIsFiltering(false); setQuery('')
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open, selected?.label])
  useLayoutEffect(() => {
    if (!open || !inputRef.current) return
    const update = () => setMenuPosition(getMenuPosition(inputRef.current!, menuBoundaryRef?.current, viewportOnly, preferAbove))
    const boundary = menuBoundaryRef?.current
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update); boundary?.addEventListener('scroll', update)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); boundary?.removeEventListener('scroll', update) }
  }, [menuBoundaryRef, open, preferAbove, viewportOnly])
  function choose(option: CustomSelectOption) {
    if (option.disabled) return
    onChange(option.value); setQuery(''); setIsFiltering(false); setOpen(false); inputRef.current?.focus()
  }
  function move(direction: number) {
    if (matching.length) setActiveIndex((current) => (current + direction + matching.length) % matching.length)
  }
  function toggleMenu() {
    if (disabled) return
    setOpen((current) => !current); setActiveIndex(0); inputRef.current?.focus()
  }
  const menu = open && menuPosition ? <div ref={menuRef} id={listboxId} role="listbox" aria-label={`${ariaLabel} options`} className="ui-dropdown scrollbar-none fixed z-[70] overflow-y-auto p-1 shadow-lg" style={menuPosition}>{matching.length ? matching.map((option, index) => <button key={option.value} id={`${inputId}-option-${index}`} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={cn('flex min-h-11 w-full min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:bg-focus-accent-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted-foreground', (option.value === value || index === activeIndex) && 'bg-selected text-foreground')}><span className="min-w-0 flex-1 break-words">{option.label}</span>{option.value === value ? <Check aria-hidden="true" size={16} className="shrink-0 text-focus-accent" /> : null}</button>) : <p className="p-2 text-sm text-muted-foreground">No matching options.</p>}</div> : null

  return <div ref={rootRef} className="relative min-w-0"><div className={cn('ui-control flex h-11 min-w-0 items-center gap-2 px-3 focus-within:border-focus-accent focus-within:bg-input-focus focus-within:ring-2 focus-within:ring-focus-accent/60', invalid && 'border-danger', disabled && 'cursor-not-allowed bg-disabled text-muted-foreground', className)}><input ref={inputRef} id={inputId} role="combobox" aria-label={ariaLabel} aria-controls={listboxId} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={open && matching[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={disabled} value={displayValue} placeholder={placeholder} onFocus={() => { if (!disabled) { setOpen(true); setActiveIndex(0) } }} onClick={() => { if (!disabled) { setOpen(true); setActiveIndex(0) } }} onChange={(event) => { setQuery(event.target.value); setIsFiltering(true); setOpen(true); setActiveIndex(0); if (value) onChange('') }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(1) } else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); move(-1) } else if (event.key === 'Enter' && open) { event.preventDefault(); const option = matching[activeIndex]; if (option) choose(option) } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setIsFiltering(false); setQuery('') } }} className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed" /><button type="button" tabIndex={-1} aria-label={`Toggle ${ariaLabel} options`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={toggleMenu} className="flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"><ChevronDown aria-hidden="true" size={18} className={cn('transition-transform', open && 'rotate-180')} /></button></div>{typeof document !== 'undefined' ? createPortal(menu, document.body) : null}</div>
}
