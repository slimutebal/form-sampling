import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { parseFleetId, parsePileId, parseTruckId, type TruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import {
  createBaseFleetDefinition,
  createDerivedFleetDefinition,
} from '@/domain/fleet/fleet-definition'
import type { FleetDefinition } from '@/domain/fleet/fleet-definition'
import {
  resolveEffectiveFleetAgainstMaster,
  type EffectiveFleet,
} from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId, type FrontDefinition } from '@/domain/fleet/front'
import { findPileArea, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode } from '@/domain/master/master-codes'
import type { Shift } from '@/domain/shift/shift'

export interface ValidatedFleetSetupDraft {
  readonly fleetSetup: FleetSetup
  readonly effectiveFleets: readonly EffectiveFleet[]
}

export function parseTruckIds(values: readonly string[]): Result<readonly TruckId[]> {
  const parsed: TruckId[] = []
  for (const value of values) {
    const result = parseTruckId(value)
    if (!result.ok) return result
    parsed.push(result.value)
  }
  return ok(parsed)
}

function buildEntry(
  entry: FleetSetupDraftEntry,
  shift: Shift,
  masterData: MasterData,
): Result<{
  readonly front: FrontDefinition
  readonly fleet: FleetDefinition
}> {
  const fleetId = parseFleetId(entry.fleetId)
  if (!fleetId.ok) return fleetId
  const frontId = createFrontId(shift.sectorCode, Number(entry.frontNumber))
  if (!frontId.ok) return frontId
  const haulerCode = parseHaulerCode(entry.haulerCode)
  if (!haulerCode.ok) return haulerCode

  let destinationPileId: FrontDefinition['destinationPileId']
  if (entry.destinationPileId.trim()) {
    const parsedPileId = parsePileId(entry.destinationPileId)
    if (!parsedPileId.ok) return parsedPileId
    const pileArea = findPileArea(masterData, parsedPileId.value)
    if (!pileArea) {
      return err<DomainError>({
        code: 'FLEET_DESTINATION_PILE_NOT_FOUND',
        message: `Destination Pile_ID ${entry.destinationPileId} was not found in this Sector's master`,
      })
    }
    destinationPileId = pileArea.pileId
  }

  const front = createFrontDefinition(frontId.value, shift.sectorCode, haulerCode.value, destinationPileId)
  if (entry.kind === 'BASE') {
    const truckIds = parseTruckIds(entry.truckIds)
    if (!truckIds.ok) return truckIds
    const fleet = createBaseFleetDefinition({
      fleetId: fleetId.value,
      frontId: frontId.value,
      truckIds: truckIds.value,
    })
    if (!fleet.ok) return fleet
    return ok({ front, fleet: fleet.value })
  }

  const referenceFleetId = parseFleetId(entry.referenceFleetId)
  if (!referenceFleetId.ok) {
    return err<DomainError>({
      code: 'FLEET_REFERENCE_REQUIRED',
      message: 'A referenced fleet must be selected',
    })
  }
  const addedTruckIds = parseTruckIds(entry.addedTruckIds)
  if (!addedTruckIds.ok) return addedTruckIds
  const removedTruckIds = parseTruckIds(entry.removedTruckIds)
  if (!removedTruckIds.ok) return removedTruckIds
  const fleet = createDerivedFleetDefinition({
    fleetId: fleetId.value,
    frontId: frontId.value,
    referenceFleetId: referenceFleetId.value,
    addedTruckIds: addedTruckIds.value,
    removedTruckIds: removedTruckIds.value,
  })
  if (!fleet.ok) return fleet
  return ok({ front, fleet: fleet.value })
}

/**
 * Converts editable strings into a validated domain snapshot. The Shift is
 * the only source of Front sector, then every effective fleet is checked
 * against MasterData before the result can be handed to another feature.
 */
export function createFleetSetupFromDraft(
  entries: readonly FleetSetupDraftEntry[],
  shift: Shift,
  masterData: MasterData,
): Result<ValidatedFleetSetupDraft> {
  if (entries.length === 0) {
    return err<DomainError>({
      code: 'FLEET_SETUP_EMPTY',
      message: 'Fleet setup requires at least one front',
    })
  }

  const fronts: FrontDefinition[] = []
  const fleets: FleetDefinition[] = []
  for (const entry of entries) {
    const built = buildEntry(entry, shift, masterData)
    if (!built.ok) return built
    fronts.push(built.value.front)
    fleets.push(built.value.fleet)
  }

  const setup = createFleetSetup({ fronts, fleets }, masterData)
  if (!setup.ok) return setup

  const effectiveFleets: EffectiveFleet[] = []
  for (const fleet of setup.value.fleets) {
    const resolved = resolveEffectiveFleetAgainstMaster(masterData, setup.value, fleet.fleetId)
    if (!resolved.ok) return resolved
    effectiveFleets.push(resolved.value)
  }

  return ok({ fleetSetup: setup.value, effectiveFleets })
}
