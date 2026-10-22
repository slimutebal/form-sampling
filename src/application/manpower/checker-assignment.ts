import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'

/**
 * Resolves the one operational Checker for a workspace. New workspaces use
 * `checkerPersonId`; the legacy `jobDeskCode === "Checker"` representation is
 * read only as a compatibility fallback so old rows remain usable without a
 * destructive migration.
 */
export function resolveCheckerPersonId(
  manpower: readonly ManpowerAssignment[],
  checkerPersonId?: string,
): string | undefined {
  if (checkerPersonId && manpower.some((person) => person.personId === checkerPersonId)) {
    return checkerPersonId
  }

  const legacyCheckers = manpower.filter((person) => person.jobDeskCode.trim() === 'Checker')
  return legacyCheckers.length === 1 ? legacyCheckers[0].personId : undefined
}

export function isCheckerAssignment(
  person: Pick<ManpowerAssignment, 'personId' | 'jobDeskCode'>,
  checkerPersonId?: string,
): boolean {
  return checkerPersonId !== undefined
    ? person.personId === checkerPersonId
    : person.jobDeskCode.trim() === 'Checker'
}

export function operationalJobDescription(
  person: Pick<ManpowerAssignment, 'jobDeskCode' | 'isPic'>,
  isChecker: boolean,
): string {
  if (!person.isPic) return isChecker ? 'Checker' : 'Sampler'
  return person.jobDeskCode.trim() === 'Checker' ? 'Checker' : person.jobDeskCode
}
