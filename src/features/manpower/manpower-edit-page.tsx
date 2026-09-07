import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createManpowerFromDraft,
  type ManpowerDraftEntry,
} from '@/application/manpower/create-manpower-from-draft'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import { manpowerErrorTranslationKey } from '@/features/manpower/error-messages'
import { PersonnelSearchField, SelectedPersonnelList } from '@/features/manpower/manpower-roster-fields'
import { manpowerAssignmentsToSelected, useManpowerRoster } from '@/features/manpower/use-manpower-roster'

export interface ManpowerEditPageProps {
  readonly masterData: MasterData
  /** The current shift's already-saved roster (Field Finding 1) — pre-fills the editor rather than starting empty. */
  readonly initialAssignments: readonly ManpowerAssignment[]
  readonly onSave: (manpower: readonly ManpowerAssignment[]) => void
  readonly onCancel: () => void
  readonly saving?: boolean
  /** A store-write failure surfaced by the caller after a successful local validation — never a raw error message. */
  readonly saveErrorKey?: string
}

/**
 * Mid-shift Manpower edit screen (Field Finding 1): lets the operator
 * add/remove personnel and change Job Desk for the CURRENT shift's
 * roster after the shift is already active — crew replacement,
 * additional crew, Staff/PIC change, dispatcher change, job assignment
 * change. Launched from Home, never from Start/Registrasi
 * Shift/Fleet Setup, and never touches shift date/code/sector/Sampling
 * House, fleet, pile workspace, haulage, or sample handling — this
 * screen only ever calls back with a revalidated Manpower array via
 * `onSave`; persisting it is the caller's responsibility
 * (`LocalOperationalStore.updateShiftManpower`).
 *
 * Reuses the exact same search/add/remove/Job-Desk-edit behavior and
 * validation (`createManpowerFromDraft`) as the initial Manpower Setup
 * screen — no business validation is duplicated here.
 */
export function ManpowerEditPage({
  masterData,
  initialAssignments,
  onSave,
  onCancel,
  saving = false,
  saveErrorKey,
}: ManpowerEditPageProps) {
  const { t } = useTranslation()
  const roster = useManpowerRoster(masterData, manpowerAssignmentsToSelected(initialAssignments))
  const [validationErrorKey, setValidationErrorKey] = useState<string>()

  function handleAddPerson(personId: string, name: string, source: 'EMPLOYEE' | 'CREW', jobCode?: string) {
    roster.addPerson(personId, name, source, jobCode)
    setValidationErrorKey(undefined)
  }

  function handleRemovePerson(personId: string) {
    roster.removePerson(personId)
    setValidationErrorKey(undefined)
  }

  function handleJobDeskChange(personId: string, jobDeskCode: string) {
    roster.changeJobDesk(personId, jobDeskCode)
    setValidationErrorKey(undefined)
  }

  function handleSave() {
    const draftEntries: ManpowerDraftEntry[] = roster.selected.map((person) => ({
      personId: person.personId,
      jobDeskCode: person.jobDeskCode,
    }))
    const result = createManpowerFromDraft(draftEntries, masterData)
    if (!result.ok) {
      setValidationErrorKey(manpowerErrorTranslationKey(result.error.code))
      return
    }
    onSave(result.value)
  }

  const errorKey = validationErrorKey ?? saveErrorKey

  return (
    <div>
      <PageHeader title={t('manpower.editTitle')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            {t('manpower.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {t('manpower.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
