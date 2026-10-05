import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/**
 * Shared "pick a truck, then Add/Remove" control, used by both the
 * pre-shift `FrontEditor` and the active-shift Front continuation editor
 * — the same interaction, never reimplemented per screen.
 */
export function TruckAction({
  id,
  label,
  actionLabel,
  options,
  value,
  onValueChange,
  onAction,
  compact = false,
}: {
  id: string
  label: string
  actionLabel: string
  options: readonly string[]
  value: string
  onValueChange: (value: string) => void
  onAction: (value: string) => void
  /** The active Setup sheet uses an upward search popup; legacy forms stay select-based. */
  compact?: boolean
}) {
  const actionEnabled = value.length > 0 && options.includes(value)
  const [query, setQuery] = useState('')
  const matchingOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  function handleAction() {
    if (!actionEnabled) return
    onAction(value)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {compact ? <div className="relative"><input aria-label={label} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label} className="h-11 w-full rounded-md border border-border bg-background px-3 text-base" />{query.trim() ? <div className="scrollbar-none absolute bottom-full left-0 z-30 mb-1 max-h-44 w-full overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg">{matchingOptions.map((truckId) => <button key={truckId} type="button" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { onAction(truckId); onValueChange(''); setQuery('') }}>{truckId}</button>)}{matchingOptions.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No matching truck.</p> : null}</div> : null}</div> : <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-11 min-w-0 rounded-md border border-border bg-background px-3 text-base"
        >
          <option value="">—</option>
          {options.map((truckId) => (
            <option key={truckId} value={truckId}>
              {truckId}
            </option>
          ))}
        </select>
        <Button type="button" onClick={handleAction} disabled={!actionEnabled}>
          {actionLabel}
        </Button>
      </div>}
    </div>
  )
}

/** Shared selected-truck list with a per-row "undo" action — mirrors `TruckAction`'s reuse rationale. */
export function SelectedTrucks({
  truckIds,
  actionLabel,
  onRemove,
  compact = false,
}: {
  truckIds: readonly string[]
  actionLabel: (truckId: string) => string
  onRemove: (truckId: string) => void
  /** Setup's Fleet sheet needs scan-friendly chips; other flows keep rows. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  if (truckIds.length === 0)
    return <p className="text-sm text-muted-foreground">{t('fleetSetup.noTrucks')}</p>
  return (
    <ul className={compact ? 'flex flex-wrap gap-2' : 'flex max-h-64 flex-col gap-2 overflow-y-auto'}>
      {truckIds.map((truckId) => (
        <li
          key={truckId}
          className={compact ? 'flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm' : 'flex min-w-0 items-center justify-between gap-2 rounded-md bg-background px-3 py-2'}
        >
          <span className={compact ? 'font-medium' : 'min-w-0 break-all font-medium'}>{truckId}</span>
          {compact ? <button type="button" onClick={() => onRemove(truckId)} aria-label={actionLabel(truckId)} className="ml-1 leading-none text-muted-foreground">×</button> : <Button type="button" variant="ghost" onClick={() => onRemove(truckId)} aria-label={actionLabel(truckId)}>{t('fleetSetup.remove')}</Button>}
        </li>
      ))}
    </ul>
  )
}
