import type { Brand } from '../common/brand'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FleetId, FrontId } from '../common/identifiers'
import type { MasterData } from '../master/master-data'
import type { FrontDefinition } from './front'
import { cloneFleetDefinition, validateFleetDefinitionTruckLists, type FleetDefinition } from './fleet-definition'

/**
 * Raw shape of a Front/Fleet catalog. Any caller can construct this
 * shape directly — it makes no promise about duplicate-free
 * collections, valid Front/Fleet references, or an acyclic reference
 * graph. Use this only as input to createFleetSetup(); do not treat it
 * as a validated snapshot.
 */
export interface FleetSetupInput {
  readonly fronts: readonly FrontDefinition[]
  readonly fleets: readonly FleetDefinition[]
}

/**
 * A validated Front/Fleet setup snapshot. Branded (nominal, no runtime
 * field) so a raw FleetSetupInput-shaped object cannot be assigned
 * directly as a FleetSetup. The only way to obtain one is
 * createFleetSetup(), which guarantees:
 *  - no duplicate FrontId / FleetId (§9)
 *  - every FleetDefinition's own truck lists are structurally valid
 *    (no duplicate/contradictory TruckId, §10/§11) — enforced even if
 *    the FleetDefinition was not built through
 *    createBaseFleetDefinition/createDerivedFleetDefinition
 *  - every FrontDefinition's SectorCode/HaulerCode exist in MasterData (§14)
 *  - every FleetDefinition references an existing FrontDefinition (§6)
 *  - every DERIVED fleet's referenceFleetId exists in the setup (§5)
 *  - the fleet reference graph is acyclic (§4)
 * Effective fleet resolution (fleet-resolution.ts) relies on these
 * guarantees and therefore only accepts a validated FleetSetup.
 */
export type FleetSetup = Brand<FleetSetupInput, 'FleetSetup'>

function findDuplicate<T>(items: readonly T[], keyOf: (item: T) => string): string | undefined {
  const seen = new Set<string>()
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) {
      return key
    }
    seen.add(key)
  }
  return undefined
}

/**
 * Detects a fleet-reference cycle among DERIVED fleets (§4). Walks each
 * DERIVED fleet's reference chain, tracking the fleets visited along
 * that specific chain; a chain that revisits a fleet already on its own
 * path is a cycle (covers self-reference and multi-fleet cycles alike).
 * Assumes every referenceFleetId already resolves within `byId` — the
 * caller must check FLEET_REFERENCE_NOT_FOUND first.
 */
function findFleetReferenceCycle(fleets: readonly FleetDefinition[]): FleetId | undefined {
  const byId = new Map(fleets.map((fleet) => [fleet.fleetId, fleet]))
  for (const fleet of fleets) {
    if (fleet.kind !== 'DERIVED') {
      continue
    }
    const visited = new Set<FleetId>([fleet.fleetId])
    let current: FleetDefinition | undefined = byId.get(fleet.referenceFleetId)
    while (current && current.kind === 'DERIVED') {
      if (visited.has(current.fleetId)) {
        return fleet.fleetId
      }
      visited.add(current.fleetId)
      current = byId.get(current.referenceFleetId)
    }
  }
  return undefined
}

/**
 * Builds a validated FleetSetup snapshot from a raw Front/Fleet catalog
 * plus a validated MasterData snapshot. Fails on the first structural
 * problem found (§1, §4, §5, §6, §9, §14). The returned snapshot holds
 * copies of both collections — including each FleetDefinition's nested
 * truck-list arrays — so later mutation of the caller's arrays,
 * including nested ones, cannot change it (§2, §24).
 */
export function createFleetSetup(input: FleetSetupInput, masterData: MasterData): Result<FleetSetup> {
  const duplicateFrontId = findDuplicate(input.fronts, (front) => front.frontId)
  if (duplicateFrontId !== undefined) {
    return err<DomainError>({
      code: 'DUPLICATE_FRONT_ID',
      message: `Duplicate FrontId in fleet setup: ${duplicateFrontId}`,
    })
  }

  const duplicateFleetId = findDuplicate(input.fleets, (fleet) => fleet.fleetId)
  if (duplicateFleetId !== undefined) {
    return err<DomainError>({
      code: 'DUPLICATE_FLEET_ID',
      message: `Duplicate FleetId in fleet setup: ${duplicateFleetId}`,
    })
  }

  for (const fleet of input.fleets) {
    const structureCheck = validateFleetDefinitionTruckLists(fleet)
    if (!structureCheck.ok) {
      return structureCheck
    }
  }

  const knownSectors = new Set(masterData.sectors.map((sector) => sector.code as string))
  const knownHaulers = new Set(masterData.haulers.map((hauler) => hauler.code as string))
  for (const front of input.fronts) {
    if (!knownSectors.has(front.sectorCode)) {
      return err<DomainError>({
        code: 'FRONT_SECTOR_NOT_FOUND',
        message: `Front ${front.frontId} references unknown SectorCode ${front.sectorCode}`,
      })
    }
    if (!knownHaulers.has(front.haulerCode)) {
      return err<DomainError>({
        code: 'FRONT_HAULER_NOT_FOUND',
        message: `Front ${front.frontId} references unknown HaulerCode ${front.haulerCode}`,
      })
    }
  }

  const frontIds = new Set<FrontId>(input.fronts.map((front) => front.frontId))
  for (const fleet of input.fleets) {
    if (!frontIds.has(fleet.frontId)) {
      return err<DomainError>({
        code: 'FLEET_FRONT_NOT_FOUND',
        message: `Fleet ${fleet.fleetId} references unknown FrontId ${fleet.frontId}`,
      })
    }
  }

  const fleetIds = new Set<FleetId>(input.fleets.map((fleet) => fleet.fleetId))
  for (const fleet of input.fleets) {
    if (fleet.kind === 'DERIVED' && !fleetIds.has(fleet.referenceFleetId)) {
      return err<DomainError>({
        code: 'FLEET_REFERENCE_NOT_FOUND',
        message: `Fleet ${fleet.fleetId} references unknown FleetId ${fleet.referenceFleetId}`,
      })
    }
  }

  const cyclicFleetId = findFleetReferenceCycle(input.fleets)
  if (cyclicFleetId !== undefined) {
    return err<DomainError>({
      code: 'FLEET_REFERENCE_CYCLE',
      message: `Fleet ${cyclicFleetId} is part of a fleet reference cycle`,
    })
  }

  const snapshot: FleetSetupInput = {
    fronts: [...input.fronts],
    fleets: input.fleets.map(cloneFleetDefinition),
  }
  return ok(snapshot as FleetSetup)
}
