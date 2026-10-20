import type { EmployeeId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createManpowerAssignment, type ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { findCrew, findEmployee, type MasterData } from '@/domain/master/master-data'
import type { CrewCode } from '@/domain/master/master-codes'

/**
 * Editable form-level shape for one Manpower row before validation.
 * There is no `isPic` field: PIC is derived from master-table membership
 * (post-inspection correction §1), never a user-set flag.
 */
export interface ManpowerDraftEntry {
  readonly personId: string
  readonly jobDeskCode: string
}

/**
 * Validates and resolves Manpower draft entries into persisted
 * `ManpowerAssignment`s (Phase 18 §4, corrected §1). Each `personId` must
 * resolve against the Employee or Crew master (name is never typed
 * manually), and duplicate `personId`s within the same shift are
 * rejected.
 *
 * PIC (`isPic`) is derived strictly from which master the person resolved
 * against — Employees/Staff are always PIC, Crews are never PIC — not
 * from any string prefix and not from user input. Multiple Staff/PIC
 * entries are explicitly valid; there is deliberately no one-PIC-only
 * check.
 *
 * Crew have two operational roles in this context: the selected Checker,
 * or Sampler. The upstream Crew master job code is informational only and
 * must not turn an ordinary Crew member into another role or block saving
 * when it is blank. Staff levels remain a Master Employee presentation
 * concern; no level is invented or overwritten here.
 */
export function createManpowerFromDraft(
  entries: readonly ManpowerDraftEntry[],
  masterData: MasterData,
): Result<readonly ManpowerAssignment[], DomainError> {
  const seenPersonIds = new Set<string>()
  const assignments: ManpowerAssignment[] = []

  for (const entry of entries) {
    if (seenPersonIds.has(entry.personId)) {
      return err({
        code: 'DUPLICATE_MANPOWER_PERSON_ID',
        message: `Duplicate personId in manpower setup: ${entry.personId}`,
      })
    }
    seenPersonIds.add(entry.personId)

    const employee = findEmployee(masterData, entry.personId as EmployeeId)
    const crew = employee ? undefined : findCrew(masterData, entry.personId as CrewCode)
    const name = employee?.name ?? crew?.name
    if (name === undefined) {
      return err({
        code: 'MANPOWER_PERSON_NOT_FOUND',
        message: `personId ${entry.personId} does not resolve to a known Employee or Crew`,
      })
    }

    const isPic = employee !== undefined

    const jobDeskCode = isPic
      ? entry.jobDeskCode
      : entry.jobDeskCode.trim().toLocaleLowerCase() === 'checker'
        ? 'Checker'
        : 'Sampler'

    assignments.push(createManpowerAssignment(entry.personId, name, jobDeskCode, isPic))
  }

  return ok(assignments)
}
