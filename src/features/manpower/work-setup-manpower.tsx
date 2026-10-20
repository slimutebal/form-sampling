import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchPersonnel } from '@/application/manpower/personnel-search'
import { isPengawasEmployee } from '@/application/manpower/pengawas-role'
import { sortSelectedStaffByLevel } from '@/application/manpower/personnel-order'
import { Button } from '@/components/ui/button'
import type { MasterData } from '@/domain/master/master-data'
import type { SelectedPerson } from '@/features/manpower/use-manpower-roster'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'

export interface WorkSetupManpowerSelection {
  readonly selected: readonly SelectedPerson[]
  readonly checkerPersonId?: string
}

interface RosterGroupProps {
  readonly title: string
  readonly people: readonly SelectedPerson[]
  readonly emptyWarning?: string
  readonly roleFor: (person: SelectedPerson) => string
  readonly removeNameLabel: (name: string) => string
  readonly onRemove: (personId: string) => void
}

function RosterGroup({
  title,
  people,
  emptyWarning,
  roleFor,
  removeNameLabel,
  onRemove,
}: RosterGroupProps) {
  return (
    <section className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2" aria-label={title}>
      <h3 className="type-section-title pt-2">{title}</h3>
      <div className="flex min-w-0 flex-col gap-1.5">
        {emptyWarning ? <p className="rounded-md bg-danger/10 px-3 py-2 type-field-helper text-danger">{emptyWarning}</p> : null}

        {people.map((person) => (
          <div
            key={person.personId}
            className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 shadow-sm"
          >
            <p className="type-field-value min-w-0 flex-1 truncate">
              {person.name}{' '}
              <span className="type-body-muted text-muted-foreground">
                · {person.personId}
              </span>
            </p>
            <span className="type-meta shrink-0 text-muted-foreground">{roleFor(person)}</span>
            <Button
              type="button"
              variant="ghost"
              className="h-8 min-w-8 px-1 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => onRemove(person.personId)}
              aria-label={removeNameLabel(person.name)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

interface WorkSetupManpowerProps {
  masterData: MasterData
  value: WorkSetupManpowerSelection
  error?: string
  workContext?: {
    readonly sectorCode: string
    readonly samplingHouseCode: string
    readonly shiftDate: string
    readonly shiftCode: string
  }
  onChange: (value: WorkSetupManpowerSelection) => void
}

/**
 * Work Setup manpower:
 *
 * - Checker is selected on Landing, not here.
 * - Checker remains part of the selected manpower roster.
 * - Only Staff with an explicit supervisory Level = Pengawas.
 * - Crew = Crew.
 * - Only the selected roster is vertically scrollable.
 */
export function WorkSetupManpower({
  masterData,
  value,
  error,
  workContext,
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

  // Checker does not change someone's personnel classification. Only an
  // explicit supervisory Employees.Level may satisfy Pengawas.
  const staff = sortSelectedStaffByLevel(
    value.selected.filter((person) => person.source === 'EMPLOYEE'), masterData.employees,
  )
  const supervisors = staff.filter((person) => isPengawasEmployee(person.personId, masterData))
  const ordinaryStaff = staff.filter((person) => !isPengawasEmployee(person.personId, masterData))

  const crew = value.selected.filter(
    (person) => person.source === 'CREW',
  )
  // A Crew-sourced Checker does not satisfy the separate Crew requirement.
  const nonCheckerCrew = crew.filter((person) => person.personId !== value.checkerPersonId)
  const shiftLeadPeople = [...supervisors, ...ordinaryStaff]
  const employeeRole = (person: SelectedPerson) => {
    if (person.personId === value.checkerPersonId) return t('manpower.checker')
    return masterData.employees.find((employee) => employee.id === person.personId)?.level || t('manpower.shiftLead')
  }
  const crewRole = (person: SelectedPerson) =>
    person.personId === value.checkerPersonId ? t('manpower.checker') : t('manpower.crew')

  function addPerson(person: (typeof results)[number]) {
    onChange({
      ...value,
      selected: [
        ...value.selected,
        {
          personId: person.personId,
          name: person.name,
          source: person.source,
          jobDeskCode: person.source === 'CREW' ? 'Crew' : person.jobCode ?? '',
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
      {workContext ? <div className="mb-3 grid shrink-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-muted/70 px-3 py-2.5 shadow-sm">
        <div className="min-w-0"><p className="type-context-value truncate">{workContext.sectorCode} · {workContext.samplingHouseCode}</p></div>
        <div className="min-w-0 self-center text-right"><p className="type-field-value truncate font-bold">{formatShiftDateForDisplay(workContext.shiftDate)}</p><p className="type-field-value text-muted-foreground">{workContext.shiftCode === 'D' ? t('workSetup.dayShift') : t('workSetup.nightShift')}</p></div>
      </div> : null}

      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
          <span className="type-body-strong rounded-full bg-muted px-3 py-1.5 text-primary">
            {t('manpower.shiftLeadCount', {
              count: supervisors.length,
            })}
          </span>

          <span className="type-body-strong rounded-full bg-muted px-3 py-1.5 text-primary">
            {t('manpower.crewCount', {
              count: crew.length,
            })}
          </span>

      </div>

      {/* ONLY THIS BOX MAY SCROLL */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg bg-surface p-3"
        data-testid="work-setup-roster"
      >
        <RosterGroup
          title={t('manpower.shiftLeads')}
          people={shiftLeadPeople}
          emptyWarning={supervisors.length === 0 ? t('manpower.errors.shiftLeadRequired') : undefined}
          roleFor={employeeRole}
          removeNameLabel={(name) =>
            t('manpower.removeNamed', { name })
          }
          onRemove={removePerson}
        />

        <RosterGroup
          title={t('manpower.crew')}
          people={crew}
          emptyWarning={nonCheckerCrew.length === 0 ? t('manpower.errors.crewRequired') : undefined}
          roleFor={crewRole}
          removeNameLabel={(name) =>
            t('manpower.removeNamed', { name })
          }
          onRemove={removePerson}
        />

        {value.selected.length === 0 ? (
          <p className="type-body-muted text-muted-foreground">
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
          className="type-field-value h-11 w-full rounded-lg border border-border bg-input px-3 text-foreground focus:border-focus-accent focus:bg-input-focus focus:outline-none focus:ring-2 focus:ring-focus-accent/60"
        />

        {query.trim() ? (
          results.length === 0 ? (
            <p className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-md border border-border bg-surface-elevated p-3 text-sm text-muted-foreground shadow-lg">
              {t('manpower.noResults')}
            </p>
          ) : (
            <ul className="absolute bottom-full left-0 z-20 mb-2 flex max-h-48 w-full flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface-elevated p-2 text-foreground shadow-lg">
              {results.map((person) => (
                <li key={person.personId}>
                  <button
                    type="button"
                    onClick={() => addPerson(person)}
                    className="flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-surface px-3 text-left text-foreground hover:bg-muted hover:text-foreground focus-visible:bg-focus-accent-soft focus-visible:text-foreground focus-visible:outline-none"
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
          className="mt-2 shrink-0 rounded-md bg-danger/10 px-3 py-2 type-field-helper text-danger"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
