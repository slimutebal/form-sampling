import { parseTruckIds } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { parseFrontId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createBaseFleetDefinition, createDerivedFleetDefinition, type FleetDefinition } from '@/domain/fleet/fleet-definition'
import { resolveEffectiveFleetAgainstMaster, type EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import type { MasterData } from '@/domain/master/master-data'

export interface AdjustFrontFleetParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  /** The ACTIVE Front whose effective fleet is being persistently adjusted. */
  readonly frontId: string
  /** The FULL desired effective truck list for this Front after the adjustment — not a delta. */
  readonly truckIds: readonly string[]
}

export interface AdjustFrontFleetResult {
  readonly fleetSetup: FleetSetup
  readonly effectiveFleet: EffectiveFleet
}

/**
 * Builds and validates a persistent effective-fleet (unit) adjustment for
 * an ACTIVE Front, already loaded within an active-shift FleetSetup
 * (Field Finding 2). Unlike `appendFrontContinuation`/`appendNewBaseFront`,
 * this never creates a new Front or Fleet — the target Front's FleetId
 * and FrontId are unchanged, so this is never a continuation (BR1/04
 * stays BR1/04):
 *  - BASE Front: its `truckIds` is replaced outright with
 *    `params.truckIds` (the operator's full desired list).
 *  - DERIVED Front: its `referenceFleetId` (and therefore its lineage —
 *    predecessor chain) is preserved unchanged; only its `addedTruckIds`/
 *    `removedTruckIds` delta is recomputed relative to its reference
 *    fleet's OWN effective set, so that the delta resolves to exactly
 *    `params.truckIds`.
 * Rejects a Front that is not ACTIVE (`FRONT_NOT_ACTIVE`) — a historical
 * Front's fleet is never editable, mirroring `appendFrontContinuation`'s
 * `FRONT_ALREADY_SUPERSEDED` guard for the same underlying invariant.
 * Rejects a resulting effective fleet of 0 trucks (`FRONT_MINIMUM_UNIT_REQUIRED`)
 * — an ACTIVE Front must always retain at least 1 effective truck; the
 * operator may remove trucks down to exactly 1, never to none, in either
 * a BASE or a DERIVED Front. This never marks the Front inactive or
 * introduces any stored status — Front active/historical status stays
 * purely derived (`deriveFrontLineage`), unrelated to unit count.
 * Every other Front/Fleet in `params.fleetSetup` is carried through
 * unchanged and re-validated as part of the whole graph via
 * `createFleetSetup` (duplicate/incompatible trucks, hauler mismatch,
 * etc. — no fleet math is duplicated here). Never mutates
 * `params.fleetSetup`/`params.masterData`. Does not touch any previously
 * recorded HaulageTransaction — a haulage's own `truckValidation`
 * snapshot is never retroactively reclassified by this adjustment.
 */
export function adjustFrontFleet(params: AdjustFrontFleetParams): Result<AdjustFrontFleetResult, DomainError> {
  const frontId = parseFrontId(params.frontId)
  if (!frontId.ok) return frontId

  const front = params.fleetSetup.fronts.find((candidate) => candidate.frontId === frontId.value)
  if (!front) {
    return err({
      code: 'FRONT_NOT_FOUND',
      message: `Front ${params.frontId} does not exist in this shift's fleet setup`,
    })
  }

  const lineage = deriveFrontLineage(params.fleetSetup)
  if (!lineage.activeFrontIds.includes(frontId.value)) {
    return err({
      code: 'FRONT_NOT_ACTIVE',
      message: `Front ${params.frontId} is not ACTIVE — a historical Front's effective fleet cannot be adjusted`,
    })
  }

  const existingFleet = params.fleetSetup.fleets.find((fleet) => fleet.frontId === frontId.value)
  if (!existingFleet) {
    return err({
      code: 'FLEET_FRONT_NOT_FOUND',
      message: `Front ${params.frontId} has no fleet configured`,
    })
  }

  const desiredTruckIds = parseTruckIds(params.truckIds)
  if (!desiredTruckIds.ok) return desiredTruckIds

  let updatedFleet: FleetDefinition
  if (existingFleet.kind === 'BASE') {
    const rebuilt = createBaseFleetDefinition({
      fleetId: existingFleet.fleetId,
      frontId: existingFleet.frontId,
      truckIds: desiredTruckIds.value,
    })
    if (!rebuilt.ok) return rebuilt
    updatedFleet = rebuilt.value
  } else {
    const referenceEffective = resolveEffectiveFleetAgainstMaster(
      params.masterData,
      params.fleetSetup,
      existingFleet.referenceFleetId,
    )
    if (!referenceEffective.ok) return referenceEffective

    const referenceTruckIds = new Set(referenceEffective.value.truckIds)
    const desiredSet = new Set(desiredTruckIds.value)
    const removedTruckIds = referenceEffective.value.truckIds.filter((truckId) => !desiredSet.has(truckId))
    const addedTruckIds = desiredTruckIds.value.filter((truckId) => !referenceTruckIds.has(truckId))

    const rebuilt = createDerivedFleetDefinition({
      fleetId: existingFleet.fleetId,
      frontId: existingFleet.frontId,
      referenceFleetId: existingFleet.referenceFleetId,
      addedTruckIds,
      removedTruckIds,
    })
    if (!rebuilt.ok) return rebuilt
    updatedFleet = rebuilt.value
  }

  const mergedSetup = createFleetSetup(
    {
      fronts: params.fleetSetup.fronts,
      fleets: params.fleetSetup.fleets.map((fleet) => (fleet.fleetId === updatedFleet.fleetId ? updatedFleet : fleet)),
    },
    params.masterData,
  )
  if (!mergedSetup.ok) return mergedSetup

  const effectiveFleet = resolveEffectiveFleetAgainstMaster(params.masterData, mergedSetup.value, updatedFleet.fleetId)
  if (!effectiveFleet.ok) return effectiveFleet

  if (effectiveFleet.value.truckIds.length === 0) {
    return err({
      code: 'FRONT_MINIMUM_UNIT_REQUIRED',
      message: `Front ${params.frontId} must retain at least 1 effective truck`,
    })
  }

  return ok({
    fleetSetup: mergedSetup.value,
    effectiveFleet: effectiveFleet.value,
  })
}
