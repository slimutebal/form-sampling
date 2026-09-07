import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { SelectedPerson } from '@/features/manpower/use-manpower-roster'

/** Shared search box + result list — reused by both the initial setup and mid-shift edit screens. */
export function PersonnelSearchField({
  query,
  onQueryChange,
  searchResults,
  onAddPerson,
}: {
  query: string
  onQueryChange: (query: string) => void
  searchResults: readonly { personId: string; name: string; source: 'EMPLOYEE' | 'CREW'; jobCode?: string }[]
  onAddPerson: (personId: string, name: string, source: 'EMPLOYEE' | 'CREW', jobCode?: string) => void
}) {
  const { t } = useTranslation()
  const searchInputId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={searchInputId} className="text-sm font-medium">
        {t('manpower.search')}
      </label>
      <input
        id={searchInputId}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('manpower.searchPlaceholder')}
        className="h-11 rounded-md border border-border bg-background px-3 text-base"
      />
      {query.trim() ? (
        searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('manpower.noResults')}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {searchResults.map((result) => (
              <li key={result.personId}>
                <button
                  type="button"
                  onClick={() => onAddPerson(result.personId, result.name, result.source, result.jobCode)}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left"
                >
                  <span className="min-w-0 break-all">
                    <span className="font-medium">{result.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{result.personId}</span>
                  </span>
                  <span className="text-sm text-primary">{t('manpower.add')}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}

/** Shared selected-personnel list with per-row remove + Job Desk editing — reused by both screens. */
export function SelectedPersonnelList({
  selected,
  onRemovePerson,
  onJobDeskChange,
}: {
  selected: readonly SelectedPerson[]
  onRemovePerson: (personId: string) => void
  onJobDeskChange: (personId: string, jobDeskCode: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t('manpower.selectedPersonnel')}</h2>
      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('manpower.noPersonnel')}
        </p>
      ) : (
        selected.map((person) => (
          <Card key={person.personId}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{person.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{person.personId}</p>
                  {person.source === 'EMPLOYEE' ? (
                    <p className="text-sm font-medium text-primary">{t('manpower.picLabel')}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onRemovePerson(person.personId)}
                  aria-label={t('manpower.removeNamed', { name: person.name })}
                >
                  {t('manpower.remove')}
                </Button>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('manpower.jobDesk')}
                <input
                  value={person.jobDeskCode}
                  onChange={(event) => onJobDeskChange(person.personId, event.target.value)}
                  className="h-11 rounded-md border border-border bg-background px-3 text-base"
                />
              </label>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
