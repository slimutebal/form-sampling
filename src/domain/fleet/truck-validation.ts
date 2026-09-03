import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FleetId, TruckId } from '../common/identifiers'
import type { HaulerCode } from '../master/master-codes'
import { findTruck, type MasterData } from '../master/master-data'
import type { TruckReference } from '../master/references'
import { resolveEffectiveFleetAgainstMaster } from './fleet-resolution'
import type { FleetSetup } from './fleet-setup'

/**
 * Pure reference filter for the confirmed rule that truck options are
 * filtered by Hauler (BR-FLEET-003, §17). Read-only: never mutates
 * MasterData or the returned array's backing collection, carries no UI
 * labels, and enforces no truck-count limit.
 */
export function findTrucksForHauler(masterData: MasterData, haulerCode: HaulerCode): readonly TruckReference[] {
  return masterData.trucks.filter((truck) => truck.haulerCode === haulerCode)
}

/** Stable, language-neutral Wrong Truck reason codes (§19). */
export type WrongTruckReasonCode = 'NOT_IN_EFFECTIVE_FLEET' | 'HAULER_MISMATCH'

export type TruckValidationResult =
  | {
      readonly status: 'VALID'
      readonly fleetId: FleetId
      readonly truckId: TruckId
    }
  | {
      readonly status: 'WRONG_TRUCK'
      readonly fleetId: FleetId
      readonly truckId: TruckId
      readonly reasons: readonly WrongTruckReasonCode[]
    }

/**
 * Classifies a selected TruckId against a specific fleet's effective
 * membership and the fleet's Front hauler (§18–§21, BR-TRUCK-001).
 *
 * This is classification only:
 *  - VALID / WRONG_TRUCK with reason codes are the entire result;
 *  - no `allowed` / `blocked` / `canContinue` field is produced — the
 *    Wrong Truck blocking level is NEEDS_CONFIRMATION (BUSINESS_RULES.md
 *    §29) and is a later application/UI decision, not a Phase 5 one.
 *
 * An unknown selected TruckId is a distinct explicit domain error
 * (TRUCK_NOT_FOUND_IN_MASTER, §20) — it is never classified as an
 * ordinary Wrong Truck, because Wrong Truck means a *known* truck used
 * outside its valid fleet/hauler context.
 *
 * A selected truck is never classified VALID against an effective fleet
 * that is itself inconsistent with MasterData (an effective member that
 * doesn't exist in master, or belongs to a different hauler than the
 * Front). This uses resolveEffectiveFleetAgainstMaster() — not the raw
 * structural resolveEffectiveFleet() — so that a bad fleet setup always
 * surfaces as an explicit domain error rather than a false VALID.
 */
export function validateTruckForFleet(
  masterData: MasterData,
  fleetSetup: FleetSetup,
  fleetId: FleetId,
  truckId: TruckId,
): Result<TruckValidationResult> {
  const truck = findTruck(masterData, truckId)
  if (!truck) {
    return err<DomainError>({
      code: 'TRUCK_NOT_FOUND_IN_MASTER',
      message: `Truck ${truckId} does not exist in master data`,
    })
  }

  const resolved = resolveEffectiveFleetAgainstMaster(masterData, fleetSetup, fleetId)
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

  const reasons: WrongTruckReasonCode[] = []
  if (!resolved.value.truckIds.includes(truckId)) {
    reasons.push('NOT_IN_EFFECTIVE_FLEET')
  }
  if (truck.haulerCode !== front.haulerCode) {
    reasons.push('HAULER_MISMATCH')
  }

  if (reasons.length === 0) {
    return ok({ status: 'VALID', fleetId, truckId })
  }
  return ok({ status: 'WRONG_TRUCK', fleetId, truckId, reasons })
}
