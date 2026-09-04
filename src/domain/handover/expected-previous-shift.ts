import type { ShiftCode } from '../common/codes'
import type { ShiftDate } from '../common/shift-date'
import type { HandoverShiftInfo } from './handover-shift-info'

/**
 * The previous shift the operator/application explicitly expects this
 * archive to be (rule: "Prefer validation against an explicit
 * expectedPreviousShift input"). Deliberately not derived by any
 * Day/Night-complement inference — the exact previous-shift date/shift
 * relationship is not a confirmed business rule (BUSINESS_RULES.md never
 * states it), so the caller (application/UI) must supply this
 * explicitly rather than the domain guessing it.
 */
export interface ExpectedPreviousShift {
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
}

/** Structured relationship-check result — never a boolean/throw (ARCHITECTURE.md §12 shows this as a WARNING, not an automatic rejection). */
export interface PreviousShiftRelationshipCheck {
  readonly dateMatches: boolean
  readonly shiftMatches: boolean
  readonly matches: boolean
}

/**
 * Compares the archive's own Shift_Info against the caller-supplied
 * expectation (Import Validation — ARCHITECTURE.md §12: "Previous shift
 * relationship valid"). Pure comparison, no invented calendar/shift
 * sequencing logic.
 */
export function checkPreviousShiftRelationship(
  shiftInfo: HandoverShiftInfo,
  expected: ExpectedPreviousShift,
): PreviousShiftRelationshipCheck {
  const dateMatches = shiftInfo.date === expected.date
  const shiftMatches = shiftInfo.shiftCode === expected.shiftCode
  return { dateMatches, shiftMatches, matches: dateMatches && shiftMatches }
}
