import type { FleetId, FrontId, PileId, TruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import type { HaulerCode } from '@/domain/master/master-codes'
import type { MasterData } from '@/domain/master/master-data'

/**
 * One operator-selectable Front/Fleet option for normal haulage entry
 * (docs/ROADMAP.md Phase 10 §16): the UI label is primarily the
 * FrontId, while FleetId is the internal selection key.
 * `effectiveTruckIds` is the Fleet's resolved membership — the Truck
 * selector must only ever offer these (§17), never free text and never
 * an unknown Truck.
 */
export interface OperationalFleetOption {
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly haulerCode: HaulerCode
  readonly effectiveTruckIds: readonly TruckId[]
}

/**
 * Builds the operational Front/Fleet options for the Pile Haulage entry
 * form from a validated FleetSetup, using `resolveEffectiveFleetAgainstMaster`
 * for every FleetDefinition (Phase 5 reuse — fleet inheritance is never
 * resolved in React). Fails on the first inconsistent fleet rather than
 * silently omitting it, so a broken operational context is never
 * presented to the operator as a smaller-but-valid option list.
 */
export function operationalFleetOptions(
  masterData: MasterData,
  fleetSetup: FleetSetup,
): Result<readonly OperationalFleetOption[], DomainError> {
  const options: OperationalFleetOption[] = []
  for (const fleet of fleetSetup.fleets) {
    const resolved = resolveEffectiveFleetAgainstMaster(masterData, fleetSetup, fleet.fleetId)
    if (!resolved.ok) {
      return resolved
    }
    const front = fleetSetup.fronts.find((candidate) => candidate.frontId === resolved.value.frontId)
    if (!front) {
      return err({
        code: 'FLEET_FRONT_NOT_FOUND',
        message: `Fleet ${fleet.fleetId} references unknown FrontId ${resolved.value.frontId}`,
      })
    }
    options.push({
      fleetId: resolved.value.fleetId,
      frontId: resolved.value.frontId,
      haulerCode: front.haulerCode,
      effectiveTruckIds: resolved.value.truckIds,
    })
  }
  return ok(options)
}

/**
 * Builds the Pile Haulage entry Front/Fleet options scoped to one opened
 * Pile (active-shift Fleet continuation rules): only fleets whose Front is
 * ACTIVE (`deriveFrontLineage` — a Front superseded by a continuation is
 * never offered again) AND whose configured `destinationPileId` matches
 * `pileId` are included. A Front with no configured destination at all is
 * treated as unscoped and still offered for every Pile, preserving the
 * original behavior for Fronts that never set a Destination (Phase 18 §5
 * left it optional). Reuses `operationalFleetOptions`/`deriveFrontLineage`
 * — no fleet or lineage math is duplicated here.
 */
export function operationalFleetOptionsForPile(
  masterData: MasterData,
  fleetSetup: FleetSetup,
  pileId: PileId,
): Result<readonly OperationalFleetOption[], DomainError> {
  const allOptions = operationalFleetOptions(masterData, fleetSetup)
  if (!allOptions.ok) {
    return allOptions
  }

  const lineage = deriveFrontLineage(fleetSetup)
  const activeFrontIds = new Set(lineage.activeFrontIds)
  const frontById = new Map(fleetSetup.fronts.map((front) => [front.frontId, front]))

  return ok(
    allOptions.value.filter((option) => {
      if (!activeFrontIds.has(option.frontId)) {
        return false
      }
      const front = frontById.get(option.frontId)
      return !front?.destinationPileId || front.destinationPileId === pileId
    }),
  )
}

/**
 * Resolves the single operational Front/Fleet option a route/query
 * context names (Phase 18 §5 — the Pile Operation checker no longer
 * offers a Front dropdown; the Front is chosen earlier on the Pile list
 * and carried by the route instead). Reuses
 * `operationalFleetOptionsForPile` verbatim, so the same rules apply:
 * the named Front must exist, be ACTIVE (not superseded by a
 * continuation), and either have no configured destination or have this
 * exact Pile as its destination. A stale/invalid `frontId` (unknown,
 * HISTORICAL, or destination-mismatched) fails with one stable
 * `FRONT_NOT_AVAILABLE_FOR_PILE` code rather than three separate ones —
 * the UI's response (return the operator to Pile selection) is the same
 * regardless of which condition failed.
 */
export function operationalFleetOptionForFront(
  masterData: MasterData,
  fleetSetup: FleetSetup,
  pileId: PileId,
  frontId: string,
): Result<OperationalFleetOption, DomainError> {
  const optionsResult = operationalFleetOptionsForPile(masterData, fleetSetup, pileId)
  if (!optionsResult.ok) {
    return optionsResult
  }
  const option = optionsResult.value.find((candidate) => (candidate.frontId as string) === frontId)
  if (!option) {
    return err({
      code: 'FRONT_NOT_AVAILABLE_FOR_PILE',
      message: `Front ${frontId} is not an active Front for Pile ${pileId}`,
    })
  }
  return ok(option)
}
