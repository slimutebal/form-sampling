/**
 * Maps stable domain/application/store error codes to translation keys
 * under the `production` i18n namespace's `correction.errors.*` for the
 * Edit/Switch/Void screens (Phase 4). Never renders a raw
 * DomainError/LocalDatabaseError `.message`.
 */
const PRODUCTION_CORRECTION_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  REASON_REQUIRED: 'correction.errors.reasonRequired',
  RECORD_VOIDED: 'correction.errors.recordVoided',
  ALREADY_VOIDED: 'correction.errors.alreadyVoided',
  RECORD_NOT_SWITCHABLE: 'correction.errors.recordNotSwitchable',
  SWITCH_TARGET_SAME_AS_SOURCE: 'correction.errors.switchTargetSameAsSource',
  PRODUCTION_POSITION_OCCUPIED: 'correction.errors.positionOccupied',
  PRODUCTION_RECORD_NOT_FOUND: 'correction.errors.recordNotFound',
  FRONT_NOT_AVAILABLE_FOR_PILE: 'correction.errors.frontNotAvailable',
  TRUCK_NOT_FOUND_IN_MASTER: 'correction.errors.truckNotFound',
  FLEET_NOT_FOUND: 'correction.errors.fleetContextInvalid',
  FLEET_FRONT_NOT_FOUND: 'correction.errors.fleetContextInvalid',
  FLEET_TRUCK_HAULER_MISMATCH: 'correction.errors.fleetContextInvalid',
  BLANK_TRUCK_ID: 'correction.errors.truckNotFound',
  ORE_SAMPLING_CONFIG_NOT_FOUND: 'correction.errors.samplingConfigMissing',
  RIT_EXCEEDS_BATCH_SIZE: 'correction.errors.samplingConfigMissing',
  PRODUCTION_CHECKER_NOT_ASSIGNED: 'correction.errors.checkerNotAssigned',
  PRODUCTION_CHECKER_AMBIGUOUS: 'correction.errors.checkerAmbiguous',
}

export function productionCorrectionErrorTranslationKey(code: string): string {
  return PRODUCTION_CORRECTION_ERROR_TRANSLATION_KEYS[code] ?? 'correction.errors.generic'
}
