import type { EmployeeId } from '@/domain/common/identifiers'
import { parseEmployeeId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'

const CHECKER_JOB_DESK_CODE = 'Checker'

/**
 * Resolves the ProductionRecord `createdBy` identity from the shift's
 * assigned manpower roster. `createdBy` is an audit identity and must
 * never be invented (never a placeholder, never guessed): the criterion
 * is `jobDeskCode === 'Checker'` — deliberately not `isPic`, since PIC
 * and Checker are different concepts and a shift may have more than one
 * PIC.
 *
 * Exactly one Checker assignment must be resolvable:
 *  - zero Checkers fails explicitly with PRODUCTION_CHECKER_NOT_ASSIGNED
 *    rather than falling back to any other role;
 *  - more than one Checker fails explicitly with
 *    PRODUCTION_CHECKER_AMBIGUOUS rather than silently picking the
 *    first one.
 */
export function resolveProductionRecorder(
  manpower: readonly ManpowerAssignment[],
): Result<EmployeeId, DomainError> {
  const checkers = manpower.filter((assignment) => assignment.jobDeskCode === CHECKER_JOB_DESK_CODE)

  if (checkers.length === 0) {
    return err({
      code: 'PRODUCTION_CHECKER_NOT_ASSIGNED',
      message: 'No manpower assignment with jobDeskCode "Checker" exists for this shift',
    })
  }
  if (checkers.length > 1) {
    return err({
      code: 'PRODUCTION_CHECKER_AMBIGUOUS',
      message: 'More than one manpower assignment with jobDeskCode "Checker" exists for this shift',
    })
  }

  return parseEmployeeId(checkers[0].personId)
}
