import {
  REQUIRED_SHIFT_DATE_CODE,
  SAMPLING_HOUSE_NOT_FOUND_CODE,
  SECTOR_NOT_FOUND_CODE,
  SHIFT_CODE_NOT_ALLOWED_CODE,
} from '@/application/shift-registration/validate-shift-registration-form'

/**
 * Maps stable error codes produced by `validateShiftRegistrationForm`
 * (application layer) to translation keys. The UI must never render a
 * raw `DomainError.message` directly — that text is diagnostic English,
 * not localized operator-facing copy.
 */
const FIELD_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  [REQUIRED_SHIFT_DATE_CODE]: 'shiftStart.errors.required',
  INVALID_SHIFT_DATE_FORMAT: 'shiftStart.errors.invalidDate',
  INVALID_SHIFT_DATE_MONTH: 'shiftStart.errors.invalidDate',
  INVALID_SHIFT_DATE_DAY: 'shiftStart.errors.invalidDate',
  BLANK_SHIFT_CODE: 'shiftStart.errors.required',
  BLANK_SECTOR_CODE: 'shiftStart.errors.required',
  BLANK_SAMPLING_HOUSE_CODE: 'shiftStart.errors.required',
  [SHIFT_CODE_NOT_ALLOWED_CODE]: 'shiftStart.errors.shiftCodeNotAllowed',
  [SECTOR_NOT_FOUND_CODE]: 'shiftStart.errors.sectorNotFound',
  [SAMPLING_HOUSE_NOT_FOUND_CODE]: 'shiftStart.errors.samplingHouseNotFound',
}

export function fieldErrorTranslationKey(code: string): string {
  return FIELD_ERROR_TRANSLATION_KEYS[code] ?? 'shiftStart.errors.generic'
}
