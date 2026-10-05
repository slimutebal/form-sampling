import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchPersonnel } from '@/application/manpower/personnel-search'
import { Button } from '@/components/ui/button'
import type { MasterData } from '@/domain/master/master-data'
import type { SelectedPerson } from '@/features/manpower/use-manpower-roster'

export interface WorkSetupManpowerSelection {
  readonly selected: readonly SelectedPerson[]
  readonly checkerPersonId?: string
}

interface RosterGroupProps {
  readonly title: string
  readonly people: readonly SelectedPerson[]
  readonly removeNameLabel: (name: string) => string
  readonly onRemove: (personId: string) => void
}

function RosterGroup({
  title,
  people,
  removeNameLabel,
  onRemove,
}: RosterGroupProps) {
  if (people.length === 0) return null

  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-sm font-medium text-muted-foreground">
        {title}
      </h3>

      {people.map((person) => (
        <div
          key={person.personId}
          className="flex min-h-11 items-center gap-2 rounded-md border border-border px-2"
        >
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-11 px-2 text-red-600 hover:text-red-700"
            onClick={() => onRemove(person.personId)}
            aria-label={removeNameLabel(person.name)}
          >
            ×
          </Button>

          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {person.name}{' '}
            <span className="font-normal text-muted-foreground">
              - {person.personId}
            </span>
          </p>
        </div>
      ))}
    </section>
  )
}

interface WorkSetupManpowerProps {
  masterData: MasterData
  value: WorkSetupManpowerSelection
  error?: string
  onChange: (value: WorkSetupManpowerSelection) => void
}

/**
 * Work Setup manpower:
 *
 * - Checker is selected on Landing, not here.
 * - Checker remains part of the selected manpower roster.
 * - Employee/Staff = Pengawas.
 * - Crew = Crew.
 * - Only the selected roster is vertically scrollable.
 */
export function WorkSetupManpower({
  masterData,
  value,
  error,
  onChange,
}: WorkSetupManpowerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const selectedIds = useMemo(
    () => new Set(value.selected.map((person) => person.personId)),
    [value.selected],
  )

  const results = useMemo(
    () =>
      searchPersonnel(masterData, query).filter(
        (person) => !selectedIds.has(person.personId),
      ),
    [masterData, query, selectedIds],
  )

  // Master-derived personnel classification.
  // Checker does not change someone's personnel classification.
  const supervisors = value.selected.filter(
    (person) => person.source === 'EMPLOYEE',
  )

  const crew = value.selected.filter(
    (person) => person.source === 'CREW',
  )

  function addPerson(person: (typeof results)[number]) {
    onChange({
      ...value,
      selected: [
        ...value.selected,
        {
          personId: person.personId,
          name: person.name,
          source: person.source,
          jobDeskCode: person.jobCode ?? '',
        },
      ],
    })

    setQuery('')
  }

  function removePerson(personId: string) {
    // Checker was chosen on Landing and remains part of setup context.
    if (personId === value.checkerPersonId) return

    onChange({
      selected: value.selected.filter(
        (person) => person.personId !== personId,
      ),
      checkerPersonId: value.checkerPersonId,
    })
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="work-setup-manpower"
    >
      {/* HEADER */}
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {t('workSetup.manpower')}
        </h2>

        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-primary/30 px-2 py-1 text-xs text-primary">
            {t('manpower.supervisorCount', {
              count: supervisors.length,
            })}
          </span>

          <span className="rounded-md border border-primary/30 px-2 py-1 text-xs text-primary">
            {t('manpower.crewCount', {
              count: crew.length,
            })}
          </span>
        </div>
      </div>

      {/* ONLY THIS BOX MAY SCROLL */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border p-2"
        data-testid="work-setup-roster"
      >
        <RosterGroup
          title={t('manpower.supervisors')}
          people={supervisors}
          removeNameLabel={(name) =>
            t('manpower.removeNamed', { name })
          }
          onRemove={removePerson}
        />

        <RosterGroup
          title={t('manpower.crew')}
          people={crew}
          removeNameLabel={(name) =>
            t('manpower.removeNamed', { name })
          }
          onRemove={removePerson}
        />

        {value.selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('manpower.noPersonnel')}
          </p>
        ) : null}
      </div>

      {/* SEARCH — DIRECTLY BELOW ROSTER */}
      <div className="relative mt-2 flex shrink-0 flex-col gap-1.5">
        <label
          htmlFor="work-setup-personnel-search"
          className="sr-only"
        >
          {t('manpower.search')}
        </label>

        <input
          id="work-setup-personnel-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('manpower.searchPlaceholder')}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
        />

        {query.trim() ? (
          results.length === 0 ? (
            <p className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-md border border-border bg-background p-3 text-sm text-muted-foreground shadow-lg">
              {t('manpower.noResults')}
            </p>
          ) : (
            <ul className="absolute bottom-full left-0 z-20 mb-2 flex max-h-48 w-full flex-col gap-2 overflow-y-auto rounded-md border border-border bg-background p-2 shadow-lg">
              {results.map((person) => (
                <li key={person.personId}>
                  <button
                    type="button"
                    onClick={() => addPerson(person)}
                    className="flex min-h-11 w-full items-center justify-between rounded-md border border-border px-3 text-left"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {person.name}{' '}
                      <span className="font-normal text-muted-foreground">
                        - {person.personId}
                      </span>
                    </span>

                    <span className="shrink-0 text-sm text-primary">
                      {t('manpower.add')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-1 shrink-0 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
