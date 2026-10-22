import { useMemo, useState } from 'react'
import { searchPersonnel } from '@/application/manpower/personnel-search'
import { isCheckerAssignment } from '@/application/manpower/checker-assignment'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'

export interface SelectedPerson {
  readonly personId: string
  readonly name: string
  readonly jobDeskCode: string
  readonly source: 'EMPLOYEE' | 'CREW'
  readonly isChecker?: boolean
}

function operationalCrewJobDesk(jobDeskCode: string | undefined, preserveChecker = false): string {
  return preserveChecker && jobDeskCode?.trim().toLocaleLowerCase() === 'checker'
    ? 'Checker'
    : 'Sampler'
}

/**
 * Reconstructs the edit-state shape from a persisted roster (Field
 * Finding 1 — editing the current shift's Manpower after it was already
 * saved). `source` is re-derived from `isPic`, never re-looked-up against
 * MasterData: `createManpowerFromDraft` already established that
 * isPic === true exactly when the person resolved against the Employee
 * master, so that same mapping is safe to invert here.
 */
export function manpowerAssignmentsToSelected(
  assignments: readonly ManpowerAssignment[],
  checkerPersonId?: string,
): readonly SelectedPerson[] {
  return assignments.map((assignment) => ({
    personId: assignment.personId,
    name: assignment.name,
    jobDeskCode: assignment.isPic ? assignment.jobDeskCode : operationalCrewJobDesk(assignment.jobDeskCode, true),
    source: assignment.isPic ? 'EMPLOYEE' : 'CREW',
    isChecker: isCheckerAssignment(assignment, checkerPersonId),
  }))
}

/**
 * Shared Manpower roster edit-state (Phase 18 §4, reused unchanged by the
 * mid-shift edit flow, Field Finding 1): search/add/remove/Job-Desk-edit
 * behavior lives here once, so `ManpowerSetupPage` (initial setup) and
 * the mid-shift Manpower edit screen never re-implement it.
 */
export function useManpowerRoster(masterData: MasterData, initial: readonly SelectedPerson[] = []) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<readonly SelectedPerson[]>(initial)

  const selectedPersonIds = useMemo(() => new Set(selected.map((person) => person.personId)), [selected])

  const searchResults = useMemo(
    () => searchPersonnel(masterData, query).filter((result) => !selectedPersonIds.has(result.personId)),
    [masterData, query, selectedPersonIds],
  )

  function addPerson(personId: string, name: string, source: 'EMPLOYEE' | 'CREW', jobCode?: string) {
    setSelected((current) => [
      ...current,
      { personId, name, jobDeskCode: source === 'CREW' ? operationalCrewJobDesk(jobCode) : jobCode ?? '', source, isChecker: false },
    ])
    setQuery('')
  }

  function removePerson(personId: string) {
    setSelected((current) => current.filter((person) => person.personId !== personId))
  }

  function changeJobDesk(personId: string, jobDeskCode: string) {
    setSelected((current) =>
      current.map((person) => (person.personId === personId ? { ...person, jobDeskCode } : person)),
    )
  }

  function replaceChecker(personId: string) {
    setSelected((current) =>
      current.map((person) => {
        if (person.personId === personId) {
          return {
            ...person,
            jobDeskCode: person.source === 'CREW' ? 'Checker' : person.jobDeskCode,
            isChecker: true,
          }
        }
        if (person.isChecker) {
          return {
            ...person,
            jobDeskCode: person.source === 'CREW' ? 'Sampler' : person.jobDeskCode,
            isChecker: false,
          }
        }
        return person
      }),
    )
  }

  return { query, setQuery, selected, searchResults, addPerson, removePerson, changeJobDesk, replaceChecker }
}
