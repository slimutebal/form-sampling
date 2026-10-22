import { useId, useMemo } from 'react'
import { filterTruckOptions } from '@/features/fleet-setup/filter-truck-options'

interface SearchableTruckPickerProps {
  label: string
  placeholder: string
  noResultsLabel: string
  query: string
  onQueryChange: (query: string) => void
  truckIds: readonly string[]
  onSelect: (truckId: string) => void
  /** Opens matches upward for compact bottom-oriented forms. */
  resultsAbove?: boolean
  hideLabel?: boolean
  disabled?: boolean
}

/**
 * A search-and-tap picker for fleet candidate lists. Candidate construction
 * remains with the existing fleet application helpers in the calling editor.
 */
export function SearchableTruckPicker({
  label,
  placeholder,
  noResultsLabel,
  query,
  onQueryChange,
  truckIds,
  onSelect,
  resultsAbove = false,
  hideLabel = false,
  disabled = false,
}: SearchableTruckPickerProps) {
  const inputId = useId()
  const matches = useMemo(() => filterTruckOptions(truckIds, query), [query, truckIds])
  const hasQuery = query.trim().length > 0

  return (
    <div className={`flex flex-col gap-2 ${resultsAbove ? 'relative' : ''}`}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-sm font-medium'}>
        {label}
      </label>
      <input
        id={inputId}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-11 rounded-md border border-border bg-input px-3 text-base text-foreground transition-colors focus:border-focus-accent focus:bg-input-focus focus:outline-none focus:ring-2 focus:ring-focus-accent/60 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted-foreground"
      />
      {hasQuery && !disabled ? (
        matches.length > 0 ? (
          <ul className={`flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface-elevated p-2 text-foreground shadow-sm ${resultsAbove ? 'absolute bottom-full left-0 z-20 mb-2 w-full shadow-lg' : ''}`}>
            {matches.map((truckId) => (
              <li key={truckId}>
                <button
                  type="button"
                  onClick={() => onSelect(truckId)}
                  className="flex min-h-11 w-full items-center rounded-md border border-border bg-surface px-3 text-left font-medium text-foreground hover:bg-muted hover:text-foreground focus-visible:bg-focus-accent-soft focus-visible:text-foreground focus-visible:outline-none"
                >
                  {truckId}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{noResultsLabel}</p>
        )
      ) : null}
    </div>
  )
}
