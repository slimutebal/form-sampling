import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import type { SamplingHouseCode, SectorCode, ShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { ShiftDate } from '@/domain/common/shift-date'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'

/**
 * Stable code for the friendlier "required" message on an empty date
 * field, distinct from the parser's own format-error code
 * (`INVALID_SHIFT_DATE_FORMAT`) — both map to the same translated
 * "required" copy in the UI, but this one fires only for a genuinely
 * empty field.
 */
export const REQUIRED_SHIFT_DATE_CODE = 'REQUIRED_SHIFT_DATE'

export interface ShiftRegistrationFieldErrors {
  readonly shiftDate?: string
  readonly shiftCode?: string
  readonly sectorCode?: string
  readonly samplingHouseCode?: string
}

export interface ParsedShiftRegistrationFields {
  readonly shiftDate: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: SectorCode
  readonly samplingHouseCode: SamplingHouseCode
}

export type ShiftRegistrationFormValidation =
  | { readonly valid: true; readonly fields: ParsedShiftRegistrationFields }
  | { readonly valid: false; readonly fieldErrors: ShiftRegistrationFieldErrors }

/**
 * The single application-layer validation path for raw Shift
 * Registration form input. Every existing domain parser
 * (`parseShiftDate`/`parseShiftCode`/`parseSectorCode`/
 * `parseSamplingHouseCode`) runs exactly once here, gathering every
 * field error rather than stopping at the first — both
 * `ShiftRegistrationForm` (for field-level UI feedback) and
 * `createShiftRegistration` (for final Shift construction) consume this
 * one function instead of each re-running the parsers themselves. No
 * validation rule is invented here beyond what those parsers already
 * enforce.
 */
export function validateShiftRegistrationForm(values: ShiftRegistrationFormValues): ShiftRegistrationFormValidation {
  const fieldErrors: {
    shiftDate?: string
    shiftCode?: string
    sectorCode?: string
    samplingHouseCode?: string
  } = {}

  let shiftDate: ShiftDate | undefined
  if (values.shiftDate.trim().length === 0) {
    fieldErrors.shiftDate = REQUIRED_SHIFT_DATE_CODE
  } else {
    const result = parseShiftDate(values.shiftDate)
    if (result.ok) {
      shiftDate = result.value
    } else {
      fieldErrors.shiftDate = result.error.code
    }
  }

  const shiftCodeResult = parseShiftCode(values.shiftCode)
  const shiftCode = shiftCodeResult.ok ? shiftCodeResult.value : undefined
  if (!shiftCodeResult.ok) {
    fieldErrors.shiftCode = shiftCodeResult.error.code
  }

  const sectorCodeResult = parseSectorCode(values.sectorCode)
  const sectorCode = sectorCodeResult.ok ? sectorCodeResult.value : undefined
  if (!sectorCodeResult.ok) {
    fieldErrors.sectorCode = sectorCodeResult.error.code
  }

  const samplingHouseCodeResult = parseSamplingHouseCode(values.samplingHouseCode)
  const samplingHouseCode = samplingHouseCodeResult.ok ? samplingHouseCodeResult.value : undefined
  if (!samplingHouseCodeResult.ok) {
    fieldErrors.samplingHouseCode = samplingHouseCodeResult.error.code
  }

  if (shiftDate && shiftCode && sectorCode && samplingHouseCode) {
    return { valid: true, fields: { shiftDate, shiftCode, sectorCode, samplingHouseCode } }
  }
  return { valid: false, fieldErrors }
}
