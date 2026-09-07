/**
 * Maps stable domain/application/store error codes to translation keys
 * for the active-shift Fleet page and its Front continuation editor.
 * Never renders a raw DomainError/LocalDatabaseError `.message`.
 */
const FLEET_ACTIVE_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  FRONT_NOT_FOUND: 'fleetActive.errors.frontNotFound',
  FRONT_ALREADY_SUPERSEDED: 'fleetActive.errors.alreadySuperseded',
  FRONT_NOT_ACTIVE: 'fleetActive.errors.frontNotActive',
  FRONT_MINIMUM_UNIT_REQUIRED: 'fleetActive.errors.minimumUnitRequired',
  FRONT_NUMBER_LIMIT_REACHED: 'fleetActive.errors.numberLimitReached',
  FLEET_REFERENCE_BRANCHING: 'fleetActive.errors.alreadySuperseded',
  FLEET_DESTINATION_PILE_NOT_FOUND: 'fleetSetup.errors.destinationNotFound',
  FLEET_DESTINATION_REQUIRED: 'fleetActive.errors.destinationRequired',
  FLEET_FRONT_NOT_FOUND: 'fleetSetup.errors.frontNotFound',
  FLEET_REFERENCE_NOT_FOUND: 'fleetSetup.errors.referenceNotFound',
  FLEET_REFERENCE_CYCLE: 'fleetSetup.errors.referenceCycle',
  DUPLICATE_FRONT_ID: 'fleetSetup.errors.duplicateFront',
  DUPLICATE_FLEET_ID: 'fleetSetup.errors.generic',
  DUPLICATE_FLEET_TRUCK: 'fleetSetup.errors.duplicateTruck',
  CONTRADICTORY_FLEET_DELTA: 'fleetSetup.errors.contradictoryDelta',
  TRUCK_NOT_FOUND_IN_MASTER: 'fleetSetup.errors.truckNotFound',
  FLEET_TRUCK_HAULER_MISMATCH: 'fleetSetup.errors.haulerMismatch',
  BLANK_HAULER_CODE: 'fleetSetup.errors.haulerRequired',
  SHIFT_WORKSPACE_NOT_FOUND: 'fleetActive.errors.storeContextInvalid',
}

export function fleetActiveErrorTranslationKey(code: string): string {
  return FLEET_ACTIVE_ERROR_TRANSLATION_KEYS[code] ?? 'fleetActive.errors.generic'
}
