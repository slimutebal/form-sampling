import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FleetId, FrontId, TruckId } from '../common/identifiers'

/**
 * A fleet definition is either a BASE fleet (an explicit truck list) or
 * a DERIVED fleet (a reference to another fleet plus an explicit
 * Add/Remove delta, BR-FLEET-004/005). This discriminated union is
 * preferred over a spreadsheet-style "toggle" abstraction — the legacy
 * `Fleet Reff` mechanism is replaced with explicit actions while the
 * effective result stays equivalent (BUSINESS_RULES.md §9 note).
 *
 * There is deliberately no Truck1..Truck15 column limit (§23) — the
 * truck lists are unbounded arrays.
 */
export type FleetDefinition = BaseFleetDefinition | DerivedFleetDefinition

export interface BaseFleetDefinition {
  readonly kind: 'BASE'
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly truckIds: readonly TruckId[]
}

export interface DerivedFleetDefinition {
  readonly kind: 'DERIVED'
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly referenceFleetId: FleetId
  readonly addedTruckIds: readonly TruckId[]
  readonly removedTruckIds: readonly TruckId[]
}

/** Finds the first TruckId that appears more than once, or undefined. */
function findDuplicateTruckId(truckIds: readonly TruckId[]): TruckId | undefined {
  const seen = new Set<TruckId>()
  for (const truckId of truckIds) {
    if (seen.has(truckId)) {
      return truckId
    }
    seen.add(truckId)
  }
  return undefined
}

/**
 * Structural truck-list validation for a FleetDefinition-shaped value
 * (§10, §11), independent of how that value was constructed. This is
 * the single source of truth for these invariants:
 *  - BASE: no duplicate TruckId within `truckIds`.
 *  - DERIVED: no duplicate TruckId within `addedTruckIds`, no duplicate
 *    TruckId within `removedTruckIds`, and no TruckId present in both
 *    lists at once (a contradictory delta must never be resolved by
 *    silent first-win/last-win).
 *
 * Used by createBaseFleetDefinition/createDerivedFleetDefinition (which
 * validate their own freshly-built candidate) and by createFleetSetup
 * (which must not assume a raw FleetSetupInput's fleets were built
 * through those factories — §1). Does not mutate `fleet` and does not
 * copy anything; it only inspects.
 */
export function validateFleetDefinitionTruckLists<T extends FleetDefinition>(fleet: T): Result<T> {
  if (fleet.kind === 'BASE') {
    const duplicate = findDuplicateTruckId(fleet.truckIds)
    if (duplicate !== undefined) {
      return err<DomainError>({
        code: 'DUPLICATE_FLEET_TRUCK',
        message: `Truck ${duplicate} appears more than once in the fleet's truck list`,
      })
    }
    return ok(fleet)
  }

  const duplicateAdded = findDuplicateTruckId(fleet.addedTruckIds)
  if (duplicateAdded !== undefined) {
    return err<DomainError>({
      code: 'DUPLICATE_FLEET_TRUCK',
      message: `Truck ${duplicateAdded} appears more than once in addedTruckIds`,
    })
  }
  const duplicateRemoved = findDuplicateTruckId(fleet.removedTruckIds)
  if (duplicateRemoved !== undefined) {
    return err<DomainError>({
      code: 'DUPLICATE_FLEET_TRUCK',
      message: `Truck ${duplicateRemoved} appears more than once in removedTruckIds`,
    })
  }
  const removedSet = new Set(fleet.removedTruckIds)
  const contradictory = fleet.addedTruckIds.find((truckId) => removedSet.has(truckId))
  if (contradictory !== undefined) {
    return err<DomainError>({
      code: 'CONTRADICTORY_FLEET_DELTA',
      message: `Truck ${contradictory} appears in both addedTruckIds and removedTruckIds`,
    })
  }
  return ok(fleet)
}

/**
 * Returns a copy of a FleetDefinition whose nested truck-list arrays
 * are independent of the input's arrays (§2 snapshot isolation) — used
 * by createFleetSetup() when building its validated snapshot, so a
 * caller-owned nested array (e.g. a raw FleetDefinition's `truckIds`)
 * cannot mutate the snapshot afterward. Does not validate; callers that
 * need validation should call validateFleetDefinitionTruckLists first.
 */
export function cloneFleetDefinition(fleet: FleetDefinition): FleetDefinition {
  if (fleet.kind === 'BASE') {
    return {
      kind: 'BASE',
      fleetId: fleet.fleetId,
      frontId: fleet.frontId,
      truckIds: [...fleet.truckIds],
    }
  }
  return {
    kind: 'DERIVED',
    fleetId: fleet.fleetId,
    frontId: fleet.frontId,
    referenceFleetId: fleet.referenceFleetId,
    addedTruckIds: [...fleet.addedTruckIds],
    removedTruckIds: [...fleet.removedTruckIds],
  }
}

export interface CreateBaseFleetDefinitionParams {
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly truckIds: readonly TruckId[]
}

/**
 * Builds a BASE fleet definition. Rejects a truck list containing a
 * duplicate TruckId (§10) — ambiguous membership must not be
 * constructible. Copies `truckIds` so the returned definition is not
 * aliased to the caller-owned array (§24).
 */
export function createBaseFleetDefinition(params: CreateBaseFleetDefinitionParams): Result<BaseFleetDefinition> {
  const candidate: BaseFleetDefinition = {
    kind: 'BASE',
    fleetId: params.fleetId,
    frontId: params.frontId,
    truckIds: [...params.truckIds],
  }
  const validated = validateFleetDefinitionTruckLists(candidate)
  if (!validated.ok) {
    return validated
  }
  return ok(candidate)
}

export interface CreateDerivedFleetDefinitionParams {
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly referenceFleetId: FleetId
  readonly addedTruckIds: readonly TruckId[]
  readonly removedTruckIds: readonly TruckId[]
}

/**
 * Builds a DERIVED fleet definition. Rejects a duplicate TruckId within
 * `addedTruckIds`, within `removedTruckIds` (§10), or a TruckId present
 * in both lists at once (§11). Copies both lists so the returned
 * definition is not aliased to caller-owned arrays (§24).
 */
export function createDerivedFleetDefinition(
  params: CreateDerivedFleetDefinitionParams,
): Result<DerivedFleetDefinition> {
  const candidate: DerivedFleetDefinition = {
    kind: 'DERIVED',
    fleetId: params.fleetId,
    frontId: params.frontId,
    referenceFleetId: params.referenceFleetId,
    addedTruckIds: [...params.addedTruckIds],
    removedTruckIds: [...params.removedTruckIds],
  }
  const validated = validateFleetDefinitionTruckLists(candidate)
  if (!validated.ok) {
    return validated
  }
  return ok(candidate)
}
