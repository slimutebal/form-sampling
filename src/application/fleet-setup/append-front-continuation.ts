import { parseTruckIds } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { fleetNumberSuggestion } from '@/application/fleet-setup/fleet-editor-rules'
import { parseFleetId, parseFrontId, parsePileId, type PileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createDerivedFleetDefinition, type FleetDefinition } from '@/domain/fleet/fleet-definition'
import { resolveEffectiveFleetAgainstMaster, type EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import {
  createFrontDefinition,
  createFrontId,
  destinationPileIdsForFront,
  frontNumberFromFrontId,
  nextFrontNumber,
  type FrontDefinition,
} from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { parseExcaCode } from '@/domain/fleet/exca-code'
import type { FleetAssignmentIdentity } from '@/domain/fleet/fleet-assignment-identity'
import { findPileArea, type MasterData } from '@/domain/master/master-data'
import { validateFleetDestinationMaterials } from '@/domain/fleet/fleet-destination-material'

export interface AppendFrontContinuationParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  /** The ACTIVE Front this continuation moves the loading point from. */
  readonly referenceFrontId: string
  /** Omit to auto-assign the next available Front Number (max existing + 1) for this Sector. */
  readonly frontNumber?: number
  /** Blank/omitted inherits the reference Front's current destination. */
  readonly destinationPileId?: string
  /** All selected destinations; omission inherits the referenced Front's set. */
  readonly destinationPileIds?: readonly string[]
  /** Explicit Exca selected by the operator. Omitted only for legacy-compatible active records. */
  readonly excaCode?: string
  readonly addedTruckIds: readonly string[]
  readonly removedTruckIds: readonly string[]
  readonly fleetId: string
  /** Immutable assignment snapshot from the originating Shift workspace. */
  readonly assignmentIdentity?: FleetAssignmentIdentity
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
    const suggested = fleetNumberSuggestion(referenceFront.sectorCode, existingNumbers)
    if (suggested.exhausted) {
      const next = nextFrontNumber(existingNumbers)
      if (!next.ok) return err(next.error)
      return err({
        code: 'FRONT_NUMBER_LIMIT_REACHED',
        message: `Front number limit has already been reached for Sector ${referenceFront.sectorCode}`,
      })
    }
    frontNumber = Number(suggested.suggested.split('/')[1])
  }

  const newFrontId = createFrontId(referenceFront.sectorCode, frontNumber)
  if (!newFrontId.ok) return newFrontId

  const requestedDestinations = params.destinationPileIds?.length
    ? params.destinationPileIds
    : params.destinationPileId?.trim() ? [params.destinationPileId] : destinationPileIdsForFront(referenceFront)
  if (new Set(requestedDestinations.map((destination) => destination.trim())).size !== requestedDestinations.length) {
    return err({ code: 'FLEET_DESTINATION_DUPLICATE', message: 'A Fleet cannot contain the same destination Pile more than once' })
  }
  // Keep construction mutable, then pass the completed collection to the
  // readonly domain contract without changing its primary-destination order.
  const destinationPileIds: PileId[] = []
  for (const destination of [...new Set(requestedDestinations.map((value) => value.trim()))]) {
    const parsedPileId = parsePileId(destination)
    if (!parsedPileId.ok) return parsedPileId
    const pileArea = findPileArea(params.masterData, parsedPileId.value)
    if (!pileArea) {
      return err({
        code: 'FLEET_DESTINATION_PILE_NOT_FOUND',
        message: `Destination Pile_ID ${destination} was not found in this Sector's master`,
      })
    }
    destinationPileIds.push(pileArea.pileId)
  }
  const materialValidation = validateFleetDestinationMaterials(params.masterData, destinationPileIds.map(String))
  if (!materialValidation.ok) return materialValidation

  const excaCode = params.excaCode === undefined ? undefined : parseExcaCode(params.excaCode)
  if (excaCode && !excaCode.ok) return excaCode
  const resolvedExcaCode = excaCode?.ok ? excaCode.value : undefined

  const newFront = createFrontDefinition(
    newFrontId.value,
    referenceFront.sectorCode,
    referenceFront.haulerCode,
    destinationPileIds[0],
    resolvedExcaCode,
    destinationPileIds,
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
    assignmentIdentity: params.assignmentIdentity,
  })
  if (!newFleet.ok) return newFleet

  const mergedSetup = createFleetSetup(
    {
      fronts: [...params.fleetSetup.fronts, newFront],
      fleets: [...params.fleetSetup.fleets, newFleet.value],
      ...(params.fleetSetup.operationalState ? { operationalState: params.fleetSetup.operationalState } : {}),
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
