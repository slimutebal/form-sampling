import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import type { SamplingHouseCode, SectorCode, ShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { ShiftDate } from '@/domain/common/shift-date'
import type { MasterData } from '@/domain/master/master-data'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import { isAllowedShiftCode } from '@/application/shift-registration/allowed-shift-codes'

/**
 * Stable code for the friendlier "required" message on an empty date
 * field, distinct from the parser's own format-error code
 * (`INVALID_SHIFT_DATE_FORMAT`) — both map to the same translated
 * "required" copy in the UI, but this one fires only for a genuinely
 * empty field.
 */
export const REQUIRED_SHIFT_DATE_CODE = 'REQUIRED_SHIFT_DATE'

/** Phase 18 §1: submitted Shift Code is not one of the closed DS/NS values. */
export const SHIFT_CODE_NOT_ALLOWED_CODE = 'SHIFT_CODE_NOT_ALLOWED'
/** Phase 18 §2: submitted Sector does not exist in the validated MasterData snapshot. */
export const SECTOR_NOT_FOUND_CODE = 'REGISTRATION_SECTOR_NOT_FOUND'
/** Phase 18 §3: submitted (Sector, Sampling House) pair does not exist in the validated MasterData snapshot. Sampling House identity is Sector+Code, never Code alone. */
export const SAMPLING_HOUSE_NOT_FOUND_CODE = 'REGISTRATION_SAMPLING_HOUSE_NOT_FOUND'

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
 * one function instead of each re-running the parsers themselves.
 *
 * Phase 18 wiring correction adds three master-data-aware checks on top
 * of the existing parsers, still gathering every field error together:
 *  - Shift Code must be one of the closed DS/NS values (§1);
 *  - Sector must exist in `masterData.sectors` (§2);
 *  - Sampling House must exist in `masterData.samplingHouses` under the
 *    *same* Sector — identity is Sector+Code, never Code alone, since
 *    the same Sampling_House_Code legitimately repeats across sectors
 *    (§3, mirrors `validateMasterSamplingHouses`). This check only runs
 *    once the Sector itself is known-valid; an unresolved Sector already
 *    has its own field error and cannot meaningfully qualify a Sampling
 *    House lookup.
 */
export function validateShiftRegistrationForm(
  values: ShiftRegistrationFormValues,
  masterData: MasterData,
): ShiftRegistrationFormValidation {
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
  let shiftCode: ShiftCode | undefined
  if (!shiftCodeResult.ok) {
    fieldErrors.shiftCode = shiftCodeResult.error.code
  } else if (!isAllowedShiftCode(shiftCodeResult.value)) {
    fieldErrors.shiftCode = SHIFT_CODE_NOT_ALLOWED_CODE
  } else {
    shiftCode = shiftCodeResult.value
  }

  const sectorCodeResult = parseSectorCode(values.sectorCode)
  let sectorCode: SectorCode | undefined
  if (!sectorCodeResult.ok) {
    fieldErrors.sectorCode = sectorCodeResult.error.code
  } else if (!masterData.sectors.some((sector) => sector.code === sectorCodeResult.value)) {
    fieldErrors.sectorCode = SECTOR_NOT_FOUND_CODE
  } else {
    sectorCode = sectorCodeResult.value
  }

  const samplingHouseCodeResult = parseSamplingHouseCode(values.samplingHouseCode)
  let samplingHouseCode: SamplingHouseCode | undefined
  if (!samplingHouseCodeResult.ok) {
    fieldErrors.samplingHouseCode = samplingHouseCodeResult.error.code
  } else if (sectorCode) {
    const found = masterData.samplingHouses.some(
      (house) => house.sectorCode === sectorCode && house.code === samplingHouseCodeResult.value,
    )
    if (found) {
      samplingHouseCode = samplingHouseCodeResult.value
    } else {
      fieldErrors.samplingHouseCode = SAMPLING_HOUSE_NOT_FOUND_CODE
    }
  }
  // else: Sector is unresolved — its own field error already covers this
  // submission, and a Sector+SamplingHouse pair cannot be checked without
  // a valid Sector, so samplingHouseCode is left without its own error.

  if (shiftDate && shiftCode && sectorCode && samplingHouseCode) {
    return { valid: true, fields: { shiftDate, shiftCode, sectorCode, samplingHouseCode } }
  }
  return { valid: false, fieldErrors }
}
