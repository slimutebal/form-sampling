import type { MasterData } from '@/domain/master/master-data'
import { sortEmployeeCandidates } from './personnel-order'

/**
 * One search hit against either the Employee or Crew master (Phase 18 §4).
 * `source` is master-table membership, not a string-prefix guess — it is
 * the sole basis for PIC derivation downstream (post-inspection
 * correction §1). `jobCode` carries `CrewReference.jobCode` through
 * verbatim (undefined for Employees, which have no Job field at all) so
 * callers can prefill Job Desk when a Crew master row already has one.
 */
export interface PersonnelSearchResult {
  readonly personId: string
  readonly name: string
  readonly source: 'EMPLOYEE' | 'CREW'
  readonly jobCode?: string
  readonly level?: string
}

/**
 * Matches NIK/Employee ID/Crew ID or Name, case-insensitively, against
 * both masters (spec: "Personnel should be searchable by: NIK / Employee
 * ID / Crew ID, Name"). Pure function — no React, no storage. A blank
 * query returns no results rather than the entire master, since a full
 * dump defeats the point of a searchable selector.
 */
export function searchPersonnel(
  masterData: MasterData,
  query: string,
): readonly PersonnelSearchResult[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return []
  }

  const employeeResults = sortEmployeeCandidates(masterData.employees
    .filter(
      (employee) =>
        (employee.id as string).toLowerCase().includes(normalized) ||
        employee.name.toLowerCase().includes(normalized),
    )
    .map((employee) => employee.level === undefined
      ? { personId: employee.id as string, name: employee.name, source: 'EMPLOYEE' as const }
      : { personId: employee.id as string, name: employee.name, source: 'EMPLOYEE' as const, level: employee.level }))

  const crewResults: PersonnelSearchResult[] = masterData.crews
    .filter(
      (crew) =>
        (crew.code as string).toLowerCase().includes(normalized) || crew.name.toLowerCase().includes(normalized),
    )
    .map((crew) => ({ personId: crew.code as string, name: crew.name, source: 'CREW' as const, jobCode: crew.jobCode }))

  return [...employeeResults, ...crewResults]
}
