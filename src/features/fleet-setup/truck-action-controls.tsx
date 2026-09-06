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
}: {
  id: string
  label: string
  actionLabel: string
  options: readonly string[]
  value: string
  onValueChange: (value: string) => void
  onAction: (value: string) => void
}) {
  const actionEnabled = value.length > 0 && options.includes(value)

  function handleAction() {
    if (!actionEnabled) return
    onAction(value)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
      </div>
    </div>
  )
}

/** Shared selected-truck list with a per-row "undo" action — mirrors `TruckAction`'s reuse rationale. */
export function SelectedTrucks({
  truckIds,
  actionLabel,
  onRemove,
}: {
  truckIds: readonly string[]
  actionLabel: (truckId: string) => string
  onRemove: (truckId: string) => void
}) {
  const { t } = useTranslation()
  if (truckIds.length === 0)
    return <p className="text-sm text-muted-foreground">{t('fleetSetup.noTrucks')}</p>
  return (
    <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
      {truckIds.map((truckId) => (
        <li
          key={truckId}
          className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background px-3 py-2"
        >
          <span className="min-w-0 break-all font-medium">{truckId}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onRemove(truckId)}
            aria-label={actionLabel(truckId)}
          >
            {t('fleetSetup.remove')}
          </Button>
        </li>
      ))}
    </ul>
  )
}
