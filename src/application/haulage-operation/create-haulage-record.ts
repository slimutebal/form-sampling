import type { BatchPosition } from '@/domain/batch/batch-position'
import { parseFleetId, parseHaulageTransactionId, parseTruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
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
 * Wrong Truck is a recordable operational exception, not a blocked
 * submission (Phase 18 §6, BR-TRUCK-003 "Wrong Truck Does Not
 * Disappear" — docs/BUSINESS_RULES.md §29): the Truck checker lets the
 * operator search and select any known master Truck, not only the
 * Fleet's effective members, so a WRONG_TRUCK classification from
 * `createHaulageTransaction` is an expected, valid outcome here and is
 * handed back unchanged for the caller to persist — it is never
 * rejected or silently upgraded to VALID. Only a structurally invalid
 * id/Fleet/Truck string, or a `createHaulageTransaction` domain error
 * (e.g. an unknown Truck), still fails this function.
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

  return createHaulageTransaction({
    id: id.value,
    shiftId: params.shift.id,
    pile: params.pile,
    batchPosition: params.nextPosition,
    fleetId: fleetId.value,
    truckId: truckId.value,
    masterData: params.masterData,
    fleetSetup: params.fleetSetup,
  })
}
