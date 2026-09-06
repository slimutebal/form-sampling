import { useId, type ReactNode } from 'react'

export interface SearchableComboboxOption {
  readonly value: string
  readonly label: string
  readonly description?: string
}

interface SearchableComboboxProps {
  label: string
  query: string
  onQueryChange: (query: string) => void
  options: readonly SearchableComboboxOption[]
  onSelect: (option: SearchableComboboxOption) => void
  selectedLabel?: string
  clearLabel: string
  onClearSelection: () => void
  placeholder?: string
  noResultsContent?: ReactNode
}

/**
 * Generic search-then-select field (Phase 18 §5/§6/§15) for a catalog too
 * large for a native `<select>` — Fleet Setup's Destination/Pile field and
 * the New Pile Master search both reuse this. Once a value is selected it
 * collapses to a read-only chip with a "change" action, rather than
 * leaving a stale query string visible next to the resolved value.
 */
export function SearchableCombobox({
  label,
  query,
  onQueryChange,
  options,
  onSelect,
  selectedLabel,
  clearLabel,
  onClearSelection,
  placeholder,
  noResultsContent,
}: SearchableComboboxProps) {
  const inputId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      {selectedLabel !== undefined ? (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2.5">
          <span className="min-w-0 break-all font-medium">{selectedLabel}</span>
          <button type="button" onClick={onClearSelection} className="text-sm text-primary">
            {clearLabel}
          </button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            className="h-11 rounded-md border border-border bg-background px-3 text-base"
          />
          {query.trim() ? (
            options.length === 0 ? (
              (noResultsContent ?? null)
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {options.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => onSelect(option)}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left"
                    >
                      <span className="min-w-0 break-all">
                        <span className="font-medium">{option.label}</span>
                        {option.description ? (
                          <span className="ml-2 text-sm text-muted-foreground">{option.description}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      )}
    </div>
  )
}
