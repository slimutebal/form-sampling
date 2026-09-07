import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { PersonnelSearchField, SelectedPersonnelList } from '@/features/manpower/manpower-roster-fields'
import { useManpowerRoster } from '@/features/manpower/use-manpower-roster'

export interface ManpowerSetupPageProps {
  shift: Shift
  masterData: MasterData
  onManpowerReady: (manpower: readonly ManpowerAssignment[]) => void
  onBack?: () => void
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
 *
 * The search/add/remove/Job-Desk-edit behavior itself lives in
 * `useManpowerRoster`/`PersonnelSearchField`/`SelectedPersonnelList`,
 * shared unchanged with the mid-shift Manpower edit screen (Field
 * Finding 1) — only the surrounding shift-info card and the
 * Continue/Back submit semantics are specific to initial setup.
 */
export function ManpowerSetupPage({ shift, masterData, onManpowerReady, onBack }: ManpowerSetupPageProps) {
  const { t } = useTranslation()
  const roster = useManpowerRoster(masterData)
  const [errorKey, setErrorKey] = useState<string>()

  function handleAddPerson(personId: string, name: string, source: 'EMPLOYEE' | 'CREW', jobCode?: string) {
    roster.addPerson(personId, name, source, jobCode)
    setErrorKey(undefined)
  }

  function handleRemovePerson(personId: string) {
    roster.removePerson(personId)
    setErrorKey(undefined)
  }

  function handleJobDeskChange(personId: string, jobDeskCode: string) {
    roster.changeJobDesk(personId, jobDeskCode)
    setErrorKey(undefined)
  }

  function handleContinue() {
    const draftEntries: ManpowerDraftEntry[] = roster.selected.map((person) => ({
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

        <PersonnelSearchField
          query={roster.query}
          onQueryChange={roster.setQuery}
          searchResults={roster.searchResults}
          onAddPerson={handleAddPerson}
        />

        {errorKey ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {t(errorKey)}
          </p>
        ) : null}

        <SelectedPersonnelList
          selected={roster.selected}
          onRemovePerson={handleRemovePerson}
          onJobDeskChange={handleJobDeskChange}
        />

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
