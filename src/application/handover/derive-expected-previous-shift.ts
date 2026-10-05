import { parseShiftCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { previousCalendarDate } from '@/domain/common/shift-date'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { Shift } from '@/domain/shift/shift'
import { ALLOWED_SHIFT_CODES } from '@/application/shift-registration/allowed-shift-codes'

/**
 * Previous shift relationship:
 *
 * current N on date D
 * -> previous D on the SAME date
 *
 * current D on date D
 * -> previous N on the PREVIOUS calendar date
 */
export function deriveExpectedPreviousShift(
  shift: Shift,
): Result<ExpectedPreviousShift, DomainError> {
  if (shift.shiftCode === 'N') {
    return ok({
      date: shift.date,
      shiftCode: mustD(),
    })
  }

  if (shift.shiftCode === 'D') {
    return ok({
      date: previousCalendarDate(shift.date),
      shiftCode: mustN(),
    })
  }

  return err({
    code: 'UNSUPPORTED_SHIFT_CODE_FOR_PREVIOUS_SHIFT_DERIVATION',
    message: `Cannot derive an expected previous shift for ShiftCode ${shift.shiftCode} — only ${ALLOWED_SHIFT_CODES.join('/')} are supported`,
  })
}

function mustD() {
  const result = parseShiftCode('D')

  if (!result.ok) {
    throw new Error('unreachable: D is always a valid ShiftCode')
  }

  return result.value
}

function mustN() {
  const result = parseShiftCode('N')

  if (!result.ok) {
    throw new Error('unreachable: N is always a valid ShiftCode')
  }

  return result.value
}