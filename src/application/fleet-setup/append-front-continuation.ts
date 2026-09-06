import { parseTruckIds } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { parseFleetId, parseFrontId, parsePileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createDerivedFleetDefinition, type FleetDefinition } from '@/domain/fleet/fleet-definition'
import { resolveEffectiveFleetAgainstMaster, type EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import {
  createFrontDefinition,
  createFrontId,
  frontNumberFromFrontId,
  nextFrontNumber,
  type FrontDefinition,
} from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { findPileArea, type MasterData } from '@/domain/master/master-data'

export interface AppendFrontContinuationParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  /** The ACTIVE Front this continuation moves the loading point from. */
  readonly referenceFrontId: string
  /** Omit to auto-assign the next available Front Number (max existing + 1) for this Sector. */
  readonly frontNumber?: number
  /** Blank/omitted inherits the reference Front's current destination. */
  readonly destinationPileId?: string
  readonly addedTruckIds: readonly string[]
  readonly removedTruckIds: readonly string[]
  readonly fleetId: string
}

export interface AppendFrontContinuationResult {
  readonly fleetSetup: FleetSetup
  readonly newFront: FrontDefinition
  readonly newFleet: FleetDefinition
  readonly effectiveFleet: EffectiveFleet
}

/**
 * Builds and validates a continuation Front + Fleet from an already-loaded
 * active-shift FleetSetup (Fleet moves during an ACTIVE shift, ROADMAP
 * continuation rules): reuses `createFleetSetup`/`resolveEffectiveFleetAgainstMaster`
 * for every check — no fleet math is duplicated here. Enforces the single-
 * successor invariant up front with the dedicated `FRONT_ALREADY_SUPERSEDED`
 * error (a friendlier, continuation-specific message than the generic
 * `FLEET_REFERENCE_BRANCHING` `createFleetSetup` would otherwise raise for
 * the same underlying condition — that check still runs as defense in
 * depth). Never mutates `params.fleetSetup`/`params.masterData`. Does not
 * touch `ShiftWorkspaceRecord.piles` — activating a destination Pile that
 * is not yet part of the workspace is the caller's responsibility (see
 * `LocalOperationalStore.appendFrontContinuation`).
 */
export function appendFrontContinuation(
  params: AppendFrontContinuationParams,
): Result<AppendFrontContinuationResult, DomainError> {
  const referenceFrontId = parseFrontId(params.referenceFrontId)
  if (!referenceFrontId.ok) return referenceFrontId

  const fleetId = parseFleetId(params.fleetId)
  if (!fleetId.ok) return fleetId

  const referenceFront = params.fleetSetup.fronts.find((front) => front.frontId === referenceFrontId.value)
  if (!referenceFront) {
    return err({
      code: 'FRONT_NOT_FOUND',
      message: `Front ${params.referenceFrontId} does not exist in this shift's fleet setup`,
    })
  }

  const lineage = deriveFrontLineage(params.fleetSetup)
  if (lineage.historicalFrontIds.includes(referenceFrontId.value)) {
    return err({
      code: 'FRONT_ALREADY_SUPERSEDED',
      message: `Front ${params.referenceFrontId} already has a successor Front and cannot be referenced again`,
    })
  }

  const referenceFleet = params.fleetSetup.fleets.find((fleet) => fleet.frontId === referenceFrontId.value)
  if (!referenceFleet) {
    return err({
      code: 'FLEET_FRONT_NOT_FOUND',
      message: `Front ${params.referenceFrontId} has no fleet configured`,
    })
  }

  let frontNumber: number
  if (params.frontNumber !== undefined) {
    frontNumber = params.frontNumber
  } else {
    const existingNumbers = params.fleetSetup.fronts
      .filter((front) => front.sectorCode === referenceFront.sectorCode)
      .map((front) => frontNumberFromFrontId(front.frontId))
    const nextNumber = nextFrontNumber(existingNumbers)
    if (!nextNumber.ok) return nextNumber
    frontNumber = nextNumber.value
  }

  const newFrontId = createFrontId(referenceFront.sectorCode, frontNumber)
  if (!newFrontId.ok) return newFrontId

  const trimmedDestination = params.destinationPileId?.trim()
  let destinationPileId = referenceFront.destinationPileId
  if (trimmedDestination) {
    const parsedPileId = parsePileId(trimmedDestination)
    if (!parsedPileId.ok) return parsedPileId
    const pileArea = findPileArea(params.masterData, parsedPileId.value)
    if (!pileArea) {
      return err({
        code: 'FLEET_DESTINATION_PILE_NOT_FOUND',
        message: `Destination Pile_ID ${trimmedDestination} was not found in this Sector's master`,
      })
    }
    destinationPileId = pileArea.pileId
  }

  const newFront = createFrontDefinition(
    newFrontId.value,
    referenceFront.sectorCode,
    referenceFront.haulerCode,
    destinationPileId,
  )

  const addedTruckIds = parseTruckIds(params.addedTruckIds)
  if (!addedTruckIds.ok) return addedTruckIds
  const removedTruckIds = parseTruckIds(params.removedTruckIds)
  if (!removedTruckIds.ok) return removedTruckIds

  const newFleet = createDerivedFleetDefinition({
    fleetId: fleetId.value,
    frontId: newFrontId.value,
    referenceFleetId: referenceFleet.fleetId,
    addedTruckIds: addedTruckIds.value,
    removedTruckIds: removedTruckIds.value,
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
