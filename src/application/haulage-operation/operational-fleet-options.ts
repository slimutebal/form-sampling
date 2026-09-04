import type { FleetId, FrontId, TruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
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
 * Whether a raw UI-selected Fleet/Truck pair is still current against
 * `frontOptions` — the selected Fleet must still be present, and the
 * selected Truck must still be one of that Fleet's effective members.
 * `selectedFleetId`/`selectedTruckId` are plain strings (raw UI state,
 * not yet parsed into `FleetId`/`TruckId`), so this compares by value
 * rather than requiring an unsafe cast to the branded id types — `===`
 * between a branded string and `string` type-checks safely because the
 * branded type is structurally a `string`.
 *
 * Shared by `HaulageEntryForm` (gates the Record button) and
 * `PileHaulagePage.handleRecord` (a defensive re-check immediately
 * before generating a transaction id — never relies on the button's
 * `disabled` state alone). Both call sites must agree, so the check
 * lives here once rather than being duplicated.
 */
export function isFrontTruckSelectionCurrent(
  frontOptions: readonly OperationalFleetOption[],
  selectedFleetId: string,
  selectedTruckId: string,
): boolean {
  if (selectedFleetId.length === 0 || selectedTruckId.length === 0) {
    return false
  }
  const selectedOption = frontOptions.find((option) => option.fleetId === selectedFleetId)
  if (!selectedOption) {
    return false
  }
  return selectedOption.effectiveTruckIds.some((truckId) => truckId === selectedTruckId)
}
