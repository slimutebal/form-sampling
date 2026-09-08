/**
 * Maps stable domain/application/store error codes to translation keys
 * under the `production` i18n namespace's `record.errors.*` for the
 * Production Record entry screen. Never renders a raw
 * DomainError/LocalDatabaseError `.message`.
 */
const PRODUCTION_RECORD_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  HAULAGE_PLAN_EMPTY: 'record.errors.planEmpty',
  DUPLICATE_EXPECTED_HAULAGE_POSITION: 'record.errors.planInvalid',
  RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE: 'record.errors.planInvalid',
  RIT_EXCEEDS_BATCH_SIZE: 'record.errors.planInvalid',
  ORE_SAMPLING_CONFIG_NOT_FOUND: 'record.errors.samplingConfigMissing',
  FLEET_NOT_FOUND: 'record.errors.fleetContextInvalid',
  FLEET_FRONT_NOT_FOUND: 'record.errors.fleetContextInvalid',
  TRUCK_NOT_FOUND_IN_MASTER: 'record.errors.fleetContextInvalid',
  FLEET_TRUCK_HAULER_MISMATCH: 'record.errors.fleetContextInvalid',
  SHIFT_WORKSPACE_NOT_FOUND: 'record.errors.storeContextInvalid',
  PILE_NOT_IN_SHIFT_WORKSPACE: 'record.errors.storeContextInvalid',
  DUPLICATE_HAULAGE_TRANSACTION_ID: 'record.errors.duplicateTransaction',
  DUPLICATE_PRODUCTION_RECORD_ID: 'record.errors.duplicateTransaction',
  PRODUCTION_CHECKER_NOT_ASSIGNED: 'record.errors.checkerNotAssigned',
  PRODUCTION_CHECKER_AMBIGUOUS: 'record.errors.checkerAmbiguous',
}

/** Load-time failures (initial fetch or Retry) — falls back to a load-specific message. */
export function productionRecordLoadErrorTranslationKey(code: string): string {
  return PRODUCTION_RECORD_ERROR_TRANSLATION_KEYS[code] ?? 'record.errors.loadFailed'
}

/**
 * Plan/record-creation/save failures (derivePileHaulagePlan,
 * deriveHaulageProgress, resolveProductionRecorder, recordProduction,
 * store.addProductionTransaction) — falls back to a generic operational
 * error.
 */
export function productionRecordErrorTranslationKey(code: string): string {
  return PRODUCTION_RECORD_ERROR_TRANSLATION_KEYS[code] ?? 'record.errors.generic'
}
