/**
 * Maps stable domain/application/store/integration error codes to
 * translation keys for the Handover import screen (rule 11: "Errors
 * must use translated stable codes. Never render raw `.message`.").
 */
const HANDOVER_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  UNREADABLE_FILE: 'handover.errors.unrecognizedFile',
  FILE_READ_FAILED: 'handover.errors.loadFailed',
  MISSING_REQUIRED_SHEET: 'handover.errors.missingSheet',
  MISSING_REQUIRED_COLUMN: 'handover.errors.missingColumn',
  UNRECOGNIZED_FILE_TYPE: 'handover.errors.unrecognizedFile',
  MISSING_SCHEMA_VERSION: 'handover.errors.unsupportedSchema',
  UNSUPPORTED_SCHEMA_VERSION: 'handover.errors.unsupportedSchema',
  BLANK_SHIFT_ID: 'handover.errors.invalidShiftInfo',
  INVALID_SHIFT_DATE_FORMAT: 'handover.errors.invalidShiftInfo',
  INVALID_SHIFT_DATE_MONTH: 'handover.errors.invalidShiftInfo',
  INVALID_SHIFT_DATE_DAY: 'handover.errors.invalidShiftInfo',
  BLANK_SHIFT_CODE: 'handover.errors.invalidShiftInfo',
  BLANK_SECTOR_CODE: 'handover.errors.invalidShiftInfo',
  BLANK_SAMPLING_HOUSE_CODE: 'handover.errors.invalidShiftInfo',
  MISSING_SHIFT_INFO_ROW: 'handover.errors.invalidShiftInfo',
  MULTIPLE_SHIFT_INFO_ROWS: 'handover.errors.invalidShiftInfo',
  HANDOVER_SHIFT_ID_MISMATCH: 'handover.errors.shiftIdMismatch',
  HANDOVER_PILE_ORE_CONFLICT: 'handover.errors.pileOreConflict',
  MALFORMED_PILE_ORE: 'handover.errors.malformedPileOre',
  INVALID_PENDING_STATUS: 'handover.errors.missingColumn',
  INVALID_BATCH_NUMBER: 'handover.errors.missingColumn',
  INVALID_RIT_NUMBER: 'handover.errors.missingColumn',
  BLANK_PILE_ID: 'handover.errors.missingColumn',
  BLANK_ORE_CODE: 'handover.errors.malformedPileOre',
  INVALID_SAMPLE_DELIVERY_STATUS: 'handover.errors.missingColumn',
  SAMPLE_RANGE_REVERSED: 'handover.errors.missingColumn',
  DUPLICATE_IMPORT: 'handover.errors.duplicateImport',
  PREVIOUS_SHIFT_MISMATCH: 'handover.errors.previousShiftMismatch',
}

/** Every failure this screen can surface — file read, preview validation, and confirm — shares one mapping and one generic fallback. */
export function errorTranslationKey(code: string): string {
  return HANDOVER_ERROR_TRANSLATION_KEYS[code] ?? 'handover.errors.generic'
}
