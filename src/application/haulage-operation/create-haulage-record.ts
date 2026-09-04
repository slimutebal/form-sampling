import type { BatchPosition } from '@/domain/batch/batch-position'
import { parseFleetId, parseHaulageTransactionId, parseTruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { createHaulageTransaction, type HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { Shift } from '@/domain/shift/shift'

export interface RecordHaulageParams {
  readonly generatedTransactionId: string
  readonly shift: Shift
  readonly pile: Pile
  readonly nextPosition: BatchPosition
  readonly selectedFleetId: string
  readonly selectedTruckId: string
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
}

/**
 * Normal-workflow haulage recording orchestration (docs/ROADMAP.md Phase
 * 10 §19, §18). Parses the raw UI-supplied id/Fleet/Truck strings, then
 * delegates every business calculation to `createHaulageTransaction`
 * (Phase 6) — this function never constructs a raw HaulageTransaction
 * object itself.
 *
 * Defensive Wrong Truck guard (§18, §Q): the normal Truck selector only
 * ever offers a Fleet's effective Truck members, so `createHaulageTransaction`
 * should always classify the result VALID here. If stale/inconsistent
 * UI state somehow produces a WRONG_TRUCK classification, this function
 * refuses to hand back the transaction — it returns a stable, generic
 * operational-context error instead. This is *not* the future Wrong
 * Truck exception flow: no Continue Anyway, approval, or blocking policy
 * is implemented — the operator must simply reselect Front/Truck.
 */
export function recordHaulage(params: RecordHaulageParams): Result<HaulageTransaction, DomainError> {
  const id = parseHaulageTransactionId(params.generatedTransactionId)
  if (!id.ok) {
    return id
  }
  const fleetId = parseFleetId(params.selectedFleetId)
  if (!fleetId.ok) {
    return fleetId
  }
  const truckId = parseTruckId(params.selectedTruckId)
  if (!truckId.ok) {
    return truckId
  }

  const created = createHaulageTransaction({
    id: id.value,
    shiftId: params.shift.id,
    pile: params.pile,
    batchPosition: params.nextPosition,
    fleetId: fleetId.value,
    truckId: truckId.value,
    masterData: params.masterData,
    fleetSetup: params.fleetSetup,
  })
  if (!created.ok) {
    return created
  }

  if (created.value.truckValidation.status !== 'VALID') {
    return err({
      code: 'HAULAGE_OPERATIONAL_CONTEXT_INVALID',
      message: 'Normal haulage entry produced a non-VALID truck classification; reselect Front/Truck and try again',
    })
  }

  return created
}
