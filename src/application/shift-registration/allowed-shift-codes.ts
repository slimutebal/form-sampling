/**
 * Phase 18 closed Shift Code enumeration (wiring correction §1): the
 * Shift Registration screen must only ever submit one of these two
 * internal values — never arbitrary free text. This is a UI/registration
 * concern only; the underlying domain `ShiftCode` (`@/domain/common/codes`)
 * remains a generic non-blank string on purpose, since other phases'
 * fixtures/tests already use shift codes outside this set (e.g. legacy
 * 'D'/'N' shorthand) and this closed set is not yet a confirmed
 * domain-wide rule — only a confirmed registration-form rule.
 */
export const ALLOWED_SHIFT_CODES = ['DS', 'NS'] as const

export type AllowedShiftCode = (typeof ALLOWED_SHIFT_CODES)[number]

export function isAllowedShiftCode(value: string): value is AllowedShiftCode {
  return (ALLOWED_SHIFT_CODES as readonly string[]).includes(value)
}
