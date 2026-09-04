/**
 * Maps stable domain/application/store error codes to translation keys
 * for the Sample Handling screen (docs/ROADMAP.md Phase 11 §42). Never
 * renders a raw DomainError/LocalDatabaseError `.message`.
 */
const SAMPLE_HANDLING_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  ORE_SAMPLING_CONFIG_NOT_FOUND: 'sampleHandling.errors.samplingConfigMissing',
  SAMPLE_RANGE_REVERSED: 'sampleHandling.errors.rangeInvalid',
  SAMPLE_RANGE_EXCEEDS_BATCH_SIZE: 'sampleHandling.errors.rangeInvalid',
  SAMPLE_RANGE_HAS_NO_SAMPLE_POSITION: 'sampleHandling.errors.rangeInvalid',
  BLANK_DELIVERY_DESTINATION_CODE: 'sampleHandling.errors.destinationRequired',
  DELIVERY_DESTINATION_NOT_FOUND: 'sampleHandling.errors.destinationInvalid',
  DISPATCHER_NOT_FOUND: 'sampleHandling.errors.dispatcherInvalid',
  BLANK_EMPLOYEE_ID: 'sampleHandling.errors.dispatcherInvalid',
  SAMPLE_POSITION_OVERLAP: 'sampleHandling.errors.overlap',
  SHIFT_WORKSPACE_NOT_FOUND: 'sampleHandling.errors.storeContextInvalid',
  PILE_NOT_IN_SHIFT_WORKSPACE: 'sampleHandling.errors.storeContextInvalid',
  DUPLICATE_SAMPLE_POSITION_ID: 'sampleHandling.errors.duplicatePosition',
}

function translationKey(code: string, fallback: string): string {
  return SAMPLE_HANDLING_ERROR_TRANSLATION_KEYS[code] ?? fallback
}

/** Load-time failures (initial fetch or Retry) — falls back to a load-specific message. */
export function loadErrorTranslationKey(code: string): string {
  return translationKey(code, 'sampleHandling.errors.loadFailed')
}

/**
 * Save-time failures (overlap pre-check, recordSamplePosition,
 * store.addSamplePosition) — falls back to a generic operational error.
 */
export function saveErrorTranslationKey(code: string): string {
  return translationKey(code, 'sampleHandling.errors.generic')
}
