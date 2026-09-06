import { parseShiftCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { previousCalendarDate } from '@/domain/common/shift-date'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { Shift } from '@/domain/shift/shift'
import { ALLOWED_SHIFT_CODES } from '@/application/shift-registration/allowed-shift-codes'

/**
 * Derives the previous shift the Handover screen should expect, from the
 * just-registered current Shift, per the now-confirmed
 * docs/BUSINESS_RULES.md BR-SHIFT-003 ("Previous Shift Relationship"):
 *
 *  - current NS on date D  → previous is DS on the SAME date D;
 *  - current DS on date D  → previous is NS on date D-1.
 *
 * `@/domain/handover/expected-previous-shift.ts` itself still makes no
 * such inference ("not derived by any Day/Night-complement inference —
 * the exact previous-shift date/shift relationship is not a confirmed
 * business rule" was true before BR-SHIFT-003; the domain module's own
 * comment is intentionally left as-is since the *domain* layer still
 * takes the expectation as explicit caller input). This function is the
 * one place BR-SHIFT-003 is applied, kept out of `src/domain/**` and out
 * of `ShiftStartPage`/`HandoverPage` themselves (rule: reuse existing
 * screens, don't inline business logic inside them). Date arithmetic is
 * `previousCalendarDate` (`@/domain/common/shift-date`) — plain
 * `YYYY-MM-DD` calendar math, never device-locale `Date` parsing.
 */
export function deriveExpectedPreviousShift(shift: Shift): Result<ExpectedPreviousShift, DomainError> {
  if (shift.shiftCode === 'NS') {
    return ok({ date: shift.date, shiftCode: mustDs() })
  }
  if (shift.shiftCode === 'DS') {
    return ok({ date: previousCalendarDate(shift.date), shiftCode: mustNs() })
  }
  return err({
    code: 'UNSUPPORTED_SHIFT_CODE_FOR_PREVIOUS_SHIFT_DERIVATION',
    message: `Cannot derive an expected previous shift for ShiftCode ${shift.shiftCode} — only ${ALLOWED_SHIFT_CODES.join('/')} are supported`,
  })
}

function mustDs() {
  const result = parseShiftCode('DS')
  if (!result.ok) throw new Error('unreachable: DS is always a valid ShiftCode')
  return result.value
}

function mustNs() {
  const result = parseShiftCode('NS')
  if (!result.ok) throw new Error('unreachable: NS is always a valid ShiftCode')
  return result.value
}
