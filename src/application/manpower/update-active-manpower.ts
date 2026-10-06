import { createManpowerFromDraft } from '@/application/manpower/create-manpower-from-draft'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import { createManpowerAssignment, type ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'

export interface ActiveManpowerSelection {
  readonly personId: string
  readonly jobDeskCode: string
}

function isChecker(jobDeskCode: string): boolean {
  return jobDeskCode.trim() === 'Checker'
}

/**
 * Resolves only newly added people against the current master catalog.
 * Existing shift assignments deliberately retain their persisted identity,
 * so a later rename/removal in Google never erases historic manpower.
 */
export function updateActiveManpower(
  existing: readonly ManpowerAssignment[],
  selected: readonly ActiveManpowerSelection[],
  catalog: MasterData,
): Result<readonly ManpowerAssignment[], DomainError> {
  const existingById = new Map(existing.map((assignment) => [assignment.personId, assignment]))
  const seen = new Set<string>()
  const assignments: ManpowerAssignment[] = []

  for (const person of selected) {
    if (seen.has(person.personId)) {
      return err({ code: 'DUPLICATE_MANPOWER_PERSON_ID', message: `Duplicate personId in manpower setup: ${person.personId}` })
    }
    seen.add(person.personId)

    const persisted = existingById.get(person.personId)
    if (persisted) {
      assignments.push(createManpowerAssignment(persisted.personId, persisted.name, person.jobDeskCode, persisted.isPic))
      continue
    }

    const resolved = createManpowerFromDraft([person], catalog)
    if (!resolved.ok) return resolved
    assignments.push(resolved.value[0])
  }

  const checkerCount = assignments.filter((assignment) => isChecker(assignment.jobDeskCode)).length
  if (checkerCount !== 1) {
    return err({
      code: 'INVALID_CHECKER_COUNT',
      message: `Exactly one Checker is required; found ${checkerCount}`,
    })
  }

  return ok(assignments)
}
