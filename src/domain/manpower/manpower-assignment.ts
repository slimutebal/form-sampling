/**
 * One person assigned to work the current shift (Phase 18 §4). `personId`
 * intentionally stays a plain string rather than a branded EmployeeId/
 * CrewCode: the same field resolves against either the Employee or the
 * Crew master, and which one matched is an application-layer concern
 * (`@/application/manpower/create-manpower-from-draft`), not a domain
 * distinction. `jobDeskCode` is a plain, language-neutral string — no
 * closed enum is invented, mirroring `CrewReference.jobCode` (no
 * confirmed business rule defines a fixed set of jobs).
 *
 * Multiple assignments may have `isPic: true` at once — the operator may
 * name more than one Penanggung Jawab / PIC for a shift, and this is
 * intentional (Phase 18 §4), not a bug to be constrained to one.
 */
export interface ManpowerAssignment {
  readonly personId: string
  readonly name: string
  readonly jobDeskCode: string
  readonly isPic: boolean
}

export function createManpowerAssignment(
  personId: string,
  name: string,
  jobDeskCode: string,
  isPic: boolean,
): ManpowerAssignment {
  return { personId, name, jobDeskCode, isPic }
}
