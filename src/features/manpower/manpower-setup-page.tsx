import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchPersonnel } from '@/application/manpower/personnel-search'
import {
  createManpowerFromDraft,
  type ManpowerDraftEntry,
} from '@/application/manpower/create-manpower-from-draft'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { manpowerErrorTranslationKey } from '@/features/manpower/error-messages'

export interface ManpowerSetupPageProps {
  shift: Shift
  masterData: MasterData
  onManpowerReady: (manpower: readonly ManpowerAssignment[]) => void
  onBack?: () => void
}

interface SelectedPerson {
  readonly personId: string
  readonly name: string
  readonly jobDeskCode: string
  readonly source: 'EMPLOYEE' | 'CREW'
}

/**
 * Manpower Setup screen (Phase 18 §4, corrected §1) — inserted between
 * Handover and Fleet Setup in the Start Shift flow. Personnel are found
 * via `searchPersonnel` (Employee/Crew master, never free-typed).
 *
 * PIC (Penanggung Jawab) is derived from master-table membership, not a
 * user toggle: every Staff/Employee row is always PIC, every Crew row
 * never is, and this is shown as a read-only label rather than an
 * editable checkbox. Multiple Staff/PIC rows may be added at once — there
 * is deliberately no one-PIC-only constraint here or in
 * `createManpowerFromDraft`.
 *
 * Job Desk prefills from the Crew master's `jobCode` when known; a Crew
 * with a blank master job still requires the operator to type one before
 * continuing. A Staff/Employee Job Desk may remain blank — the Employee
 * master has no exact Job field, so this app must not invent one.
 */
export function ManpowerSetupPage({ shift, masterData, onManpowerReady, onBack }: ManpowerSetupPageProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<readonly SelectedPerson[]>([])
  const [errorKey, setErrorKey] = useState<string>()
  const searchInputId = useId()

  const selectedPersonIds = useMemo(() => new Set(selected.map((person) => person.personId)), [selected])

  const searchResults = useMemo(
    () => searchPersonnel(masterData, query).filter((result) => !selectedPersonIds.has(result.personId)),
    [masterData, query, selectedPersonIds],
  )

  function handleAddPerson(personId: string, name: string, source: 'EMPLOYEE' | 'CREW', jobCode?: string) {
    setSelected((current) => [...current, { personId, name, jobDeskCode: jobCode ?? '', source }])
    setQuery('')
    setErrorKey(undefined)
  }

  function handleRemovePerson(personId: string) {
    setSelected((current) => current.filter((person) => person.personId !== personId))
    setErrorKey(undefined)
  }

  function handleJobDeskChange(personId: string, jobDeskCode: string) {
    setSelected((current) =>
      current.map((person) => (person.personId === personId ? { ...person, jobDeskCode } : person)),
    )
    setErrorKey(undefined)
  }

  function handleContinue() {
    const draftEntries: ManpowerDraftEntry[] = selected.map((person) => ({
      personId: person.personId,
      jobDeskCode: person.jobDeskCode,
    }))
    const result = createManpowerFromDraft(draftEntries, masterData)
    if (!result.ok) {
      setErrorKey(manpowerErrorTranslationKey(result.error.code))
      return
    }
    onManpowerReady(result.value)
  }

  return (
    <div>
      <PageHeader title={t('manpower.title')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">{t('fleetSetup.sector')}</dt>
              <dd className="break-all text-right font-medium">{shift.sectorCode}</dd>
              <dt className="text-muted-foreground">{t('shiftStart.fields.samplingHouseCode')}</dt>
              <dd className="break-all text-right font-medium">{shift.samplingHouseCode}</dd>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={searchInputId} className="text-sm font-medium">
            {t('manpower.search')}
          </label>
          <input
            id={searchInputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
                      onClick={() => handleAddPerson(result.personId, result.name, result.source, result.jobCode)}
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

        {errorKey ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {t(errorKey)}
          </p>
        ) : null}

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
                      onClick={() => handleRemovePerson(person.personId)}
                      aria-label={t('manpower.removeNamed', { name: person.name })}
                    >
                      {t('manpower.remove')}
                    </Button>
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t('manpower.jobDesk')}
                    <input
                      value={person.jobDeskCode}
                      onChange={(event) => handleJobDeskChange(person.personId, event.target.value)}
                      className="h-11 rounded-md border border-border bg-background px-3 text-base"
                    />
                  </label>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={handleContinue}>
            {t('manpower.continue')}
          </Button>
          {onBack ? (
            <Button type="button" variant="secondary" className="w-full" onClick={onBack}>
              {t('fleetSetup.back')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
