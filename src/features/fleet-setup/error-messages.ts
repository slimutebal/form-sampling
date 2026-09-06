const FLEET_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  FLEET_SETUP_EMPTY: 'fleetSetup.errors.empty',
  BLANK_FRONT_ID: 'fleetSetup.errors.frontRequired',
  FRONT_NUMBER_OUT_OF_RANGE: 'fleetSetup.errors.frontRequired',
  BLANK_FLEET_ID: 'fleetSetup.errors.generic',
  BLANK_HAULER_CODE: 'fleetSetup.errors.haulerRequired',
  BLANK_TRUCK_ID: 'fleetSetup.errors.truckRequired',
  FLEET_REFERENCE_REQUIRED: 'fleetSetup.errors.referenceRequired',
  DUPLICATE_FRONT_ID: 'fleetSetup.errors.duplicateFront',
  DUPLICATE_FLEET_ID: 'fleetSetup.errors.generic',
  DUPLICATE_FLEET_TRUCK: 'fleetSetup.errors.duplicateTruck',
  CONTRADICTORY_FLEET_DELTA: 'fleetSetup.errors.contradictoryDelta',
  FRONT_SECTOR_NOT_FOUND: 'fleetSetup.errors.sectorNotFound',
  FRONT_HAULER_NOT_FOUND: 'fleetSetup.errors.haulerNotFound',
  FLEET_FRONT_NOT_FOUND: 'fleetSetup.errors.frontNotFound',
  FLEET_REFERENCE_NOT_FOUND: 'fleetSetup.errors.referenceNotFound',
  FLEET_REFERENCE_CYCLE: 'fleetSetup.errors.referenceCycle',
  FLEET_REFERENCE_BRANCHING: 'fleetSetup.errors.referenceBranching',
  FLEET_NOT_FOUND: 'fleetSetup.errors.referenceNotFound',
  TRUCK_NOT_FOUND_IN_MASTER: 'fleetSetup.errors.truckNotFound',
  FLEET_TRUCK_HAULER_MISMATCH: 'fleetSetup.errors.haulerMismatch',
  FLEET_DEPENDENCY_EXISTS: 'fleetSetup.errors.dependency',
  FLEET_DESTINATION_PILE_NOT_FOUND: 'fleetSetup.errors.destinationNotFound',
}

export function fleetErrorTranslationKey(code: string): string {
  return FLEET_ERROR_TRANSLATION_KEYS[code] ?? 'fleetSetup.errors.generic'
}
