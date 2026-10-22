import { parseTruckIds } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { fleetNumberSuggestion } from '@/application/fleet-setup/fleet-editor-rules'
import { parseFleetId, parsePileId, type PileId } from '@/domain/common/identifiers'
import { parseSectorCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createBaseFleetDefinition, type FleetDefinition } from '@/domain/fleet/fleet-definition'
import { resolveEffectiveFleetAgainstMaster, type EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId, frontNumberFromFrontId, nextFrontNumber, type FrontDefinition } from '@/domain/fleet/front'
import { parseExcaCode } from '@/domain/fleet/exca-code'
import type { FleetAssignmentIdentity } from '@/domain/fleet/fleet-assignment-identity'
import { parseHaulerCode } from '@/domain/master/master-codes'
import { findPileArea, type MasterData } from '@/domain/master/master-data'
import { validateFleetDestinationMaterials } from '@/domain/fleet/fleet-destination-material'

export interface AppendNewBaseFrontParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  readonly sectorCode: string
  readonly haulerCode: string
  /** Omit to auto-assign the next available Front Number (max existing + 1) for this Sector — mirrors `appendFrontContinuation`. */
  readonly frontNumber?: number
  /** Required — unlike a continuation, a brand-new independent Front has no reference to inherit a Destination from (Phase 18 §2). */
  readonly destinationPileId: string
  /** All selected destinations; the first remains the legacy primary destination. */
  readonly destinationPileIds?: readonly string[]
  /** Explicit Exca selected by the operator. Omitted only for legacy-compatible active records. */
  readonly excaCode?: string
  readonly truckIds: readonly string[]
  readonly fleetId: string
  /** Immutable assignment snapshot from the originating Shift workspace. */
  readonly assignmentIdentity?: FleetAssignmentIdentity
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

  const requestedDestinations = params.destinationPileIds?.length ? params.destinationPileIds : [params.destinationPileId]
  if (!requestedDestinations.length || requestedDestinations.some((destination) => !destination.trim())) {
    return err({
      code: 'FLEET_DESTINATION_REQUIRED',
      message: 'A Destination Pile is required for a new independent BASE Front',
    })
  }
  if (new Set(requestedDestinations.map((destination) => destination.trim())).size !== requestedDestinations.length) {
    return err({ code: 'FLEET_DESTINATION_DUPLICATE', message: 'A Fleet cannot contain the same destination Pile more than once' })
  }
  // Build with a mutable local collection; `createFrontDefinition` exposes it
  // through the domain's readonly contract.
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

  let frontNumber: number
  if (params.frontNumber !== undefined) {
    frontNumber = params.frontNumber
  } else {
    const existingNumbers = params.fleetSetup.fronts
      .filter((front) => front.sectorCode === sectorCode.value)
      .map((front) => frontNumberFromFrontId(front.frontId))
    const suggested = fleetNumberSuggestion(sectorCode.value, existingNumbers)
    if (suggested.exhausted) {
      const next = nextFrontNumber(existingNumbers)
      if (!next.ok) return err(next.error)
      return err({
        code: 'FRONT_NUMBER_LIMIT_REACHED',
        message: `Front number limit has already been reached for Sector ${sectorCode.value}`,
      })
    }
    frontNumber = Number(suggested.suggested.split('/')[1])
  }

  const newFrontId = createFrontId(sectorCode.value, frontNumber)
  if (!newFrontId.ok) return newFrontId

  const excaCode = params.excaCode === undefined ? undefined : parseExcaCode(params.excaCode)
  if (excaCode && !excaCode.ok) return excaCode
  const resolvedExcaCode = excaCode?.ok ? excaCode.value : undefined

  const newFront = createFrontDefinition(
    newFrontId.value,
    sectorCode.value,
    haulerCode.value,
    destinationPileIds[0],
    resolvedExcaCode,
    destinationPileIds,
  )

  const truckIds = parseTruckIds(params.truckIds)
  if (!truckIds.ok) return truckIds

  const newFleet = createBaseFleetDefinition({
    fleetId: fleetId.value,
    frontId: newFrontId.value,
    truckIds: truckIds.value,
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
