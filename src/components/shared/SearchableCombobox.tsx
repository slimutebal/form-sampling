import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export interface SearchableComboboxOption { readonly value: string; readonly label: string; readonly description?: string; readonly material?: string }
interface SearchableComboboxProps {
  label: string; query: string; onQueryChange: (query: string) => void; options: readonly SearchableComboboxOption[]; onSelect: (option: SearchableComboboxOption) => void
  selectedLabel?: string; clearLabel: string; onClearSelection: () => void; placeholder?: string; noResultsContent?: ReactNode; hideLabel?: boolean; resultsAbove?: boolean; disabled?: boolean; selectedAsControl?: boolean
  menuBoundaryRef?: RefObject<HTMLElement | null>; containerDataUi?: string; dataMaterial?: string
}
type MenuPosition = Readonly<{ left: number; top: number; width: number; maxHeight: number }>

function placement(anchor: HTMLElement, boundary?: HTMLElement | null): MenuPosition {
  const rect = anchor.getBoundingClientRect()
  const visual = window.visualViewport
  const viewportTop = visual?.offsetTop ?? 0
  const viewportBottom = viewportTop + (visual?.height ?? window.innerHeight)
  const limits = boundary?.getBoundingClientRect()
  const top = Math.max(viewportTop + 4, limits?.top ?? viewportTop + 4)
  const bottom = Math.min(viewportBottom - 4, limits?.bottom ?? viewportBottom - 4)
  const above = Math.max(0, rect.top - top)
  const below = Math.max(0, bottom - rect.bottom)
  const upward = above >= 44 && (above >= 72 || below < 72)
  const maxHeight = Math.max(44, Math.min(256, (upward ? above : below) - 4))
  const left = Math.max(4, rect.left)
  return { left, top: upward ? Math.max(top, rect.top - maxHeight - 4) : rect.bottom + 4, width: Math.min(rect.width, window.innerWidth - left - 4), maxHeight }
}

function materialTextClass(material?: string): string {
  return material === 'SAP' ? 'text-ore-sap-foreground' : material === 'LIM' ? 'text-ore-lim-foreground' : 'text-foreground'
}

/** Search field with an explicit selected-ID boundary: text is only committed by option selection. */
export function SearchableCombobox({ label, query, onQueryChange, options, onSelect, selectedLabel, onClearSelection, placeholder, noResultsContent, hideLabel = false, disabled = false, menuBoundaryRef, containerDataUi, dataMaterial }: SearchableComboboxProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition>()
  const display = typing ? query : (selectedLabel ?? query)
  const matches = useMemo(() => typing ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()) || option.value.toLowerCase().includes(query.trim().toLowerCase())) : options, [options, query, typing])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) { setOpen(false); setTyping(false); onQueryChange('') }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onQueryChange, open])
  useLayoutEffect(() => {
    if (!open || !inputRef.current) return
    const update = () => setPosition(placement(inputRef.current!, menuBoundaryRef?.current))
    const boundary = menuBoundaryRef?.current
    update(); window.addEventListener('resize', update); window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update); boundary?.addEventListener('scroll', update)
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); boundary?.removeEventListener('scroll', update) }
  }, [menuBoundaryRef, open])
  function select(option: SearchableComboboxOption) { onSelect(option); setOpen(false); setTyping(false); onQueryChange(''); inputRef.current?.focus() }
  function move(direction: number) { if (matches.length) setActiveIndex((current) => (current + direction + matches.length) % matches.length) }
  function toggleMenu() { if (!disabled) { setOpen((current) => !current); setActiveIndex(0); inputRef.current?.focus() } }
  const menu = open && position ? <div ref={menuRef} className="fixed z-[70]" style={position} data-ui="searchable-combobox-menu"><ul id={`${inputId}-options`} role="listbox" aria-label={`${label} options`} className="ui-popover scrollbar-none flex max-h-full flex-col gap-1 overflow-y-auto shadow-lg">{matches.length ? matches.map((option, index) => <li key={option.value}><button id={`${inputId}-option-${index}`} type="button" role="option" aria-selected={selectedLabel === option.label} data-material={option.material} onMouseDown={(event) => event.preventDefault()} onClick={() => select(option)} className={`flex min-h-11 w-full items-center rounded-md border border-border bg-surface px-3 text-left hover:bg-muted ${index === activeIndex ? 'bg-selected' : ''} ${materialTextClass(option.material)}`}><span className="min-w-0 break-all"><span className="font-medium">{option.label}</span>{option.description ? <span className="ml-2 text-sm text-muted-foreground">{option.description}</span> : null}</span></button></li>) : <li className="p-2 text-sm text-muted-foreground">{noResultsContent ?? 'No matching options.'}</li>}</ul></div> : null

  return <div ref={rootRef} data-ui={containerDataUi} data-material={dataMaterial} className="flex min-w-0 flex-col gap-1.5"><label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-sm font-medium'}>{label}</label><div className="ui-control flex h-11 min-w-0 items-center gap-2 px-3 focus-within:border-focus-accent focus-within:bg-input-focus focus-within:ring-2 focus-within:ring-focus-accent/60"><input ref={inputRef} id={inputId} role="combobox" aria-label={label} aria-controls={`${inputId}-options`} aria-expanded={open} aria-autocomplete="list" disabled={disabled} value={display} placeholder={placeholder} onFocus={() => { if (!disabled) { setOpen(true); setActiveIndex(0) } }} onClick={() => { if (!disabled) { setOpen(true); setActiveIndex(0) } }} onChange={(event) => { if (selectedLabel !== undefined) onClearSelection(); setTyping(true); onQueryChange(event.target.value); setOpen(true); setActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(1) } else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); move(-1) } else if (event.key === 'Enter' && open) { event.preventDefault(); const option = matches[activeIndex]; if (option) select(option) } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setTyping(false); onQueryChange('') } }} className={`min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed ${materialTextClass(dataMaterial)}`} /><button type="button" tabIndex={-1} aria-label={`Toggle ${label} options`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={toggleMenu} className="flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"><ChevronDown aria-hidden="true" size={18} className={open ? 'rotate-180' : ''} /></button></div>{typeof document !== 'undefined' ? createPortal(menu, document.body) : null}</div>
}
