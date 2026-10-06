import type { EmployeeReference } from '@/domain/master/references'

/**
 * The verified Level values used for Staff presentation. A level is never
 * used to change Employee/Crew membership; it only establishes a stable
 * order within the Staff group.
 */
const STAFF_LEVEL_RANK: Readonly<Record<string, number>> = {
  supervisor: 0,
  foreman: 1,
}

export function employeeLevelRank(level?: string): number {
  return STAFF_LEVEL_RANK[level?.trim().toLocaleLowerCase() ?? ''] ?? 2
}

function compareNameThenId(
  left: { readonly name: string; readonly personId: string },
  right: { readonly name: string; readonly personId: string },
): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.personId.localeCompare(right.personId)
}

/** Deterministically orders searchable Staff candidates by Level then Name. */
export function sortEmployeeCandidates<T extends { readonly name: string; readonly personId: string; readonly level?: string }>(
  candidates: readonly T[],
): readonly T[] {
  return [...candidates].sort(
    (left, right) => employeeLevelRank(left.level) - employeeLevelRank(right.level) || compareNameThenId(left, right),
  )
}

/**
 * Orders an already-selected Staff roster from the current master catalog.
 * Missing/removed historic references intentionally sort last rather than
 * disappearing from an active shift.
 */
export function sortSelectedStaffByLevel<T extends { readonly name: string; readonly personId: string }>(
  selected: readonly T[],
  employees: readonly EmployeeReference[],
): readonly T[] {
  const levelById = new Map(employees.map((employee) => [employee.id as string, employee.level]))
  return [...selected].sort(
    (left, right) =>
      employeeLevelRank(levelById.get(left.personId)) - employeeLevelRank(levelById.get(right.personId)) ||
      compareNameThenId(left, right),
  )
}
