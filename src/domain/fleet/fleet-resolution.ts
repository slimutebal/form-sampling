import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FleetId, FrontId, TruckId } from '../common/identifiers'
import { findTruck, type MasterData } from '../master/master-data'
import type { FleetDefinition } from './fleet-definition'
import type { FleetSetup } from './fleet-setup'

/**
 * The resolved truck membership of one fleet (§12). Deliberately holds
 * only FleetId/FrontId/truckIds — no UI state or transaction fields.
 */
export interface EffectiveFleet {
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly truckIds: readonly TruckId[]
}

/**
 * Resolves the effective truck membership of one fleet within a
 * validated FleetSetup (§3, §4, §26):
 *  - BASE fleet: effective = truckIds as configured.
 *  - DERIVED fleet: effective = reference's effective set, with
 *    removedTruckIds taken out (preserving inherited order) and
 *    addedTruckIds appended afterward in Add-list order, skipping any
 *    added truck already present (set-like membership, §11).
 * Because FleetSetup already guarantees an acyclic graph and that every
 * referenceFleetId resolves, this walk never re-checks those — it only
 * fails when the requested `fleetId` itself is not present in the
 * setup. Never mutates the input FleetSetup or its fleet definitions.
 */
export function resolveEffectiveFleet(fleetSetup: FleetSetup, fleetId: FleetId): Result<EffectiveFleet> {
  const fleet = fleetSetup.fleets.find((candidate) => candidate.fleetId === fleetId)
  if (!fleet) {
    return err<DomainError>({
      code: 'FLEET_NOT_FOUND',
      message: `Fleet ${fleetId} does not exist in the fleet setup`,
    })
  }
  return ok({
    fleetId: fleet.fleetId,
    frontId: fleet.frontId,
    truckIds: resolveTruckIds(fleetSetup, fleet),
  })
}

function resolveTruckIds(fleetSetup: FleetSetup, fleet: FleetDefinition): readonly TruckId[] {
  if (fleet.kind === 'BASE') {
    return [...fleet.truckIds]
  }
  const reference = fleetSetup.fleets.find((candidate) => candidate.fleetId === fleet.referenceFleetId)
  const baseTruckIds = reference ? resolveTruckIds(fleetSetup, reference) : []
  const removed = new Set(fleet.removedTruckIds)
  const kept = baseTruckIds.filter((truckId) => !removed.has(truckId))
  const keptSet = new Set(kept)
  const genuinelyAdded = fleet.addedTruckIds.filter((truckId) => !keptSet.has(truckId))
  return [...kept, ...genuinelyAdded]
}

/**
 * Resolves an effective fleet and additionally validates it against
 * MasterData (§13, §15, §16):
 *  - every effective TruckId must resolve to a known TruckReference
 *    (TRUCK_NOT_FOUND_IN_MASTER);
 *  - every resolved truck must belong to the fleet's Front's HaulerCode
 *    (FLEET_TRUCK_HAULER_MISMATCH), including inherited trucks.
 * Does not fabricate a truck and does not mutate MasterData or the
 * FleetSetup.
 */
export function resolveEffectiveFleetAgainstMaster(
  masterData: MasterData,
  fleetSetup: FleetSetup,
  fleetId: FleetId,
): Result<EffectiveFleet> {
  const resolved = resolveEffectiveFleet(fleetSetup, fleetId)
  if (!resolved.ok) {
    return resolved
  }

  const front = fleetSetup.fronts.find((candidate) => candidate.frontId === resolved.value.frontId)
  if (!front) {
    return err<DomainError>({
      code: 'FLEET_FRONT_NOT_FOUND',
      message: `Fleet ${fleetId} references unknown FrontId ${resolved.value.frontId}`,
    })
  }

  for (const truckId of resolved.value.truckIds) {
    const truck = findTruck(masterData, truckId)
    if (!truck) {
      return err<DomainError>({
        code: 'TRUCK_NOT_FOUND_IN_MASTER',
        message: `Effective fleet ${fleetId} contains TruckId ${truckId}, which does not exist in master data`,
      })
    }
    if (truck.haulerCode !== front.haulerCode) {
      return err<DomainError>({
        code: 'FLEET_TRUCK_HAULER_MISMATCH',
        message: `Truck ${truckId} belongs to hauler ${truck.haulerCode}, but front ${front.frontId} requires hauler ${front.haulerCode}`,
      })
    }
  }

  return ok(resolved.value)
}
