import type { EmployeeId } from '@/domain/common/identifiers'
import { parseTruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import { validateTruckForFleet } from '@/domain/fleet/truck-validation'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { MasterData } from '@/domain/master/master-data'
import {
  applyEditFields,
  type ApplyEditFieldsParams,
} from '@/domain/production/production-correction'
import type {
  Contamination,
  Disposition,
  PhysicalCondition,
  ProductionRecord,
} from '@/domain/production/production-record'
import {
  generateProductionCorrectionId,
  type ProductionCorrectionIdGenerator,
} from '@/application/production/production-correction-id-generator'
import { findAcceptActiveOccupant } from '@/application/production/production-slot'
import { operationalFleetOptionsForPile } from '@/application/haulage-operation/operational-fleet-options'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'

export interface EditProductionRecordParams {
  /** The ProductionRecord being edited (its current, pre-edit state). */
  readonly record: ProductionRecord
  /** Every ProductionRecord for the Shift (used to re-check the Pile+Batch+Rit ACCEPT+ACTIVE slot invariant, Phase 4 §8/§25 — never scoped to just this Pile by the caller, so this function scopes it itself). */
  readonly allRecordsForShift: readonly ProductionRecord[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  /** The selected Front No — must be a currently valid ACTIVE Front for this record's own Pile (Phase 4 §5). */
  readonly selectedFrontId: string
  readonly selectedTruckId: string
  readonly physicalCondition: PhysicalCondition
  readonly contamination: Contamination
  readonly disposition: Disposition
  readonly remark?: string | null
  readonly reason: string
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  readonly generateCorrectionId?: ProductionCorrectionIdGenerator
}

/**
 * Edit Record orchestration (Phase 4 §4-§8). Composes only existing
 * engines — never constructs a raw ProductionRecord/correction itself:
 *  1. Resolves the selected Front No against `operationalFleetOptionsForPile`
 *     for this record's own Pile (never a manual Front/Fleet lookup) —
 *     `FRONT_NOT_AVAILABLE_FOR_PILE` if it does not resolve to a
 *     currently valid ACTIVE Front for this Pile.
 *  2. Re-classifies Wrong Truck for the selected Front/Truck via the same
 *     Phase 5 `validateTruckForFleet` engine normal recording uses — this
 *     function never classifies Wrong Truck itself (§5 "Do not classify
 *     Wrong Truck in React" — the rule generalizes to this application
 *     layer too, not just the UI).
 *  3. Computes whether another ACCEPT + ACTIVE record already occupies
 *     this record's own Pile/Batch/Rit position (`findAcceptActiveOccupant`,
 *     excluding this record's own row) — only relevant when the edit's
 *     resulting Disposition is ACCEPT (§8).
 *  4. Delegates the actual state transition/correction-append to
 *     `applyEditFields` (Phase 4 domain engine).
 * Returns the fully rebuilt ProductionRecord for the caller to persist via
 * `ProductionCorrectionStore.updateProductionRecordWithCorrection` —
 * this function never writes anything itself.
 */
export function editProductionRecord(
  params: EditProductionRecordParams,
): Result<ProductionRecord, DomainError> {
  const frontOptionsResult = operationalFleetOptionsForPile(
    params.masterData,
    params.fleetSetup,
    params.record.transaction.pileId,
  )
  if (!frontOptionsResult.ok) {
    return frontOptionsResult
  }
  const frontOption = frontOptionsResult.value.find(
    (option) => (option.frontId as string) === params.selectedFrontId,
  )
  if (!frontOption) {
    return err({
      code: 'FRONT_NOT_AVAILABLE_FOR_PILE',
      message: `Front ${params.selectedFrontId} is not an active Front for Pile ${params.record.transaction.pileId}`,
    })
  }

  const truckIdResult = parseTruckId(params.selectedTruckId)
  if (!truckIdResult.ok) {
    return truckIdResult
  }

  const truckValidationResult = validateTruckForFleet(
    params.masterData,
    params.fleetSetup,
    frontOption.fleetId,
    truckIdResult.value,
  )
  if (!truckValidationResult.ok) {
    return truckValidationResult
  }

  const positionOccupiedByOther =
    params.disposition === 'ACCEPT' &&
    findAcceptActiveOccupant(
      params.allRecordsForShift,
      params.record.transaction.pileId,
      params.record.effective.batchPosition,
      params.record.transaction.id,
    ) !== undefined

  const correctionIdResult = parseProductionCorrectionId(
    (params.generateCorrectionId ?? generateProductionCorrectionId)(),
  )
  if (!correctionIdResult.ok) {
    return correctionIdResult
  }

  const editParams: ApplyEditFieldsParams = {
    correctionId: correctionIdResult.value,
    frontId: frontOption.frontId,
    fleetId: frontOption.fleetId,
    truckId: truckIdResult.value,
    truckValidation: truckValidationResult.value,
    physicalCondition: params.physicalCondition,
    contamination: params.contamination,
    disposition: params.disposition,
    remark: params.remark,
    reason: params.reason,
    positionOccupiedByOther,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  }

  return applyEditFields(params.record, editParams)
}
