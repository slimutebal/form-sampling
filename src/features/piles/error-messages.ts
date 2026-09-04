/**
 * Maps stable domain/application/store error codes to translation keys
 * for the Pile Haulage screen (docs/ROADMAP.md Phase 10 §41). Never
 * renders a raw DomainError/LocalDatabaseError `.message`.
 */
const PILE_HAULAGE_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  HAULAGE_PLAN_EMPTY: 'pileHaulage.errors.planEmpty',
  DUPLICATE_EXPECTED_HAULAGE_POSITION: 'pileHaulage.errors.planInvalid',
  RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE: 'pileHaulage.errors.planInvalid',
  RIT_EXCEEDS_BATCH_SIZE: 'pileHaulage.errors.planInvalid',
  ORE_SAMPLING_CONFIG_NOT_FOUND: 'pileHaulage.errors.samplingConfigMissing',
  FLEET_NOT_FOUND: 'pileHaulage.errors.fleetContextInvalid',
  FLEET_FRONT_NOT_FOUND: 'pileHaulage.errors.fleetContextInvalid',
  TRUCK_NOT_FOUND_IN_MASTER: 'pileHaulage.errors.fleetContextInvalid',
  FLEET_TRUCK_HAULER_MISMATCH: 'pileHaulage.errors.fleetContextInvalid',
  HAULAGE_OPERATIONAL_CONTEXT_INVALID: 'pileHaulage.errors.operationalContextInvalid',
  SHIFT_WORKSPACE_NOT_FOUND: 'pileHaulage.errors.storeContextInvalid',
  PILE_NOT_IN_SHIFT_WORKSPACE: 'pileHaulage.errors.storeContextInvalid',
  DUPLICATE_HAULAGE_TRANSACTION_ID: 'pileHaulage.errors.duplicateTransaction',
}

function translationKey(code: string, fallback: string): string {
  return PILE_HAULAGE_ERROR_TRANSLATION_KEYS[code] ?? fallback
}

/** Load-time failures (initial fetch or Retry) — falls back to a load-specific message. */
export function loadErrorTranslationKey(code: string): string {
  return translationKey(code, 'pileHaulage.errors.loadFailed')
}

/**
 * Plan/record-creation/save failures (deriveHaulageProgress,
 * previewNextSampling, recordHaulage, store.addHaulageTransaction) —
 * falls back to a generic operational error.
 */
export function pileHaulageErrorTranslationKey(code: string): string {
  return translationKey(code, 'pileHaulage.errors.generic')
}
