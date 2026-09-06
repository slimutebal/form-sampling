import { parseTruckIds } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { parseFleetId, parsePileId } from '@/domain/common/identifiers'
import { parseSectorCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createBaseFleetDefinition, type FleetDefinition } from '@/domain/fleet/fleet-definition'
import { resolveEffectiveFleetAgainstMaster, type EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId, frontNumberFromFrontId, nextFrontNumber, type FrontDefinition } from '@/domain/fleet/front'
import { parseHaulerCode } from '@/domain/master/master-codes'
import { findPileArea, type MasterData } from '@/domain/master/master-data'

export interface AppendNewBaseFrontParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  readonly sectorCode: string
  readonly haulerCode: string
  /** Omit to auto-assign the next available Front Number (max existing + 1) for this Sector — mirrors `appendFrontContinuation`. */
  readonly frontNumber?: number
  /** Required — unlike a continuation, a brand-new independent Front has no reference to inherit a Destination from (Phase 18 §2). */
  readonly destinationPileId: string
  readonly truckIds: readonly string[]
  readonly fleetId: string
}

export interface AppendNewBaseFrontResult {
  readonly fleetSetup: FleetSetup
  readonly newFront: FrontDefinition
  readonly newFleet: FleetDefinition
  readonly effectiveFleet: EffectiveFleet
}

/**
 * Builds and validates a brand-new, independent BASE Front + Fleet
 * during an ACTIVE shift (Phase 18 §2 "Fleet Reference = Tidak Ada"): a
 * compact version of the initial Fleet Setup's BASE front creation
 * (`createFleetSetupFromDraft`'s BASE branch), reused here rather than a
 * second fleet model — the operator picks a Hauler, a Destination, and
 * Trucks from that Hauler, with no predecessor Front ever retired (there
 * is no reference at all, so `deriveFrontLineage` has nothing to
 * supersede). Front Number auto-assignment reuses the same
 * `nextFrontNumber` rule `appendFrontContinuation` uses for a
 * continuation Front — both are "the next Front opened during this
 * active shift," just with a different Fleet shape.
 */
export function appendNewBaseFront(params: AppendNewBaseFrontParams): Result<AppendNewBaseFrontResult, DomainError> {
  const fleetId = parseFleetId(params.fleetId)
  if (!fleetId.ok) return fleetId

  const sectorCode = parseSectorCode(params.sectorCode)
  if (!sectorCode.ok) return sectorCode

  const haulerCode = parseHaulerCode(params.haulerCode)
  if (!haulerCode.ok) return haulerCode

  const trimmedDestination = params.destinationPileId.trim()
  if (!trimmedDestination) {
    return err({
      code: 'FLEET_DESTINATION_REQUIRED',
      message: 'A Destination Pile is required for a new independent BASE Front',
    })
  }
  const parsedPileId = parsePileId(trimmedDestination)
  if (!parsedPileId.ok) return parsedPileId
  const pileArea = findPileArea(params.masterData, parsedPileId.value)
  if (!pileArea) {
    return err({
      code: 'FLEET_DESTINATION_PILE_NOT_FOUND',
      message: `Destination Pile_ID ${trimmedDestination} was not found in this Sector's master`,
    })
  }

  let frontNumber: number
  if (params.frontNumber !== undefined) {
    frontNumber = params.frontNumber
  } else {
    const existingNumbers = params.fleetSetup.fronts
      .filter((front) => front.sectorCode === sectorCode.value)
      .map((front) => frontNumberFromFrontId(front.frontId))
    const nextNumber = nextFrontNumber(existingNumbers)
    if (!nextNumber.ok) return nextNumber
    frontNumber = nextNumber.value
  }

  const newFrontId = createFrontId(sectorCode.value, frontNumber)
  if (!newFrontId.ok) return newFrontId

  const newFront = createFrontDefinition(newFrontId.value, sectorCode.value, haulerCode.value, pileArea.pileId)

  const truckIds = parseTruckIds(params.truckIds)
  if (!truckIds.ok) return truckIds

  const newFleet = createBaseFleetDefinition({
    fleetId: fleetId.value,
    frontId: newFrontId.value,
    truckIds: truckIds.value,
  })
  if (!newFleet.ok) return newFleet

  const mergedSetup = createFleetSetup(
    {
      fronts: [...params.fleetSetup.fronts, newFront],
      fleets: [...params.fleetSetup.fleets, newFleet.value],
    },
    params.masterData,
  )
  if (!mergedSetup.ok) return mergedSetup

  const effectiveFleet = resolveEffectiveFleetAgainstMaster(params.masterData, mergedSetup.value, newFleet.value.fleetId)
  if (!effectiveFleet.ok) return effectiveFleet

  return ok({
    fleetSetup: mergedSetup.value,
    newFront,
    newFleet: newFleet.value,
    effectiveFleet: effectiveFleet.value,
  })
}
