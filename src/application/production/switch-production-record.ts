import type { BatchPosition } from '@/domain/batch/batch-position'
import type { EmployeeId } from '@/domain/common/identifiers'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { applySwitchPosition } from '@/domain/production/production-correction'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  generateProductionCorrectionId,
  type ProductionCorrectionIdGenerator,
} from '@/application/production/production-correction-id-generator'
import { isEffectiveProductionRecord } from '@/application/production/effective-production'
import { findAcceptActiveOccupant } from '@/application/production/production-slot'

export type ProductionSwitchMode = 'MOVE' | 'SWAP'

/**
 * The resolved outcome of targeting one Batch/Rit position from a
 * selected source ProductionRecord (Phase 4 §10/§11) — the operator
 * never chooses MOVE vs SWAP directly; it is entirely derived from
 * whether an ACCEPT + ACTIVE record already occupies `targetPosition`.
 */
export interface ProductionSwitchPlan {
  readonly mode: ProductionSwitchMode
  readonly sourceRecord: ProductionRecord
  /** Present only when `mode` is SWAP — the ACCEPT + ACTIVE record currently occupying `targetPosition`. */
  readonly targetRecord?: ProductionRecord
  readonly targetPosition: BatchPosition
}

/**
 * Plans a Switch Record operation (Phase 4 §9-§13) — read-only, no
 * correction is applied yet. Both the normal flow (source fixed, operator
 * picks target, §11) and the MISSED -> "Switch Existing Record" flow
 * (target fixed, operator picks source, §12) call this identically: the
 * only difference is which side of `(sourceRecord, targetPosition)` the
 * UI let the operator choose.
 *
 * Fails with:
 *  - `RECORD_NOT_SWITCHABLE` unless `sourceRecord` is currently ACCEPT +
 *    ACTIVE (§9, §26, §28 — a VOIDED or REJECT record can never be
 *    switched);
 *  - `SWITCH_TARGET_SAME_AS_SOURCE` if `targetPosition` is the source's
 *    own current effective position (a no-op switch is never a valid
 *    plan).
 * Cross-Pile switch is structurally impossible here — `targetPosition`
 * only ever contains Batch/Rit, and this function always resolves
 * occupancy against `sourceRecord.transaction.pileId` (Phase 4 §9 "Switch
 * only within the SAME Pile_ID").
 */
export function planProductionSwitch(
  sourceRecord: ProductionRecord,
  targetPosition: BatchPosition,
  allRecordsForShift: readonly ProductionRecord[],
): Result<ProductionSwitchPlan, DomainError> {
  if (!isEffectiveProductionRecord(sourceRecord)) {
    return err({
      code: 'RECORD_NOT_SWITCHABLE',
      message: 'Only an ACCEPT + ACTIVE ProductionRecord may be switched',
    })
  }

  const pileId = sourceRecord.transaction.pileId
  const currentPosition = sourceRecord.effective.batchPosition
  if (
    Number(currentPosition.batchNumber) === Number(targetPosition.batchNumber) &&
    Number(currentPosition.ritNumber) === Number(targetPosition.ritNumber)
  ) {
    return err({
      code: 'SWITCH_TARGET_SAME_AS_SOURCE',
      message: 'Target position is the same as the source record’s current position',
    })
  }

  const targetOccupant = findAcceptActiveOccupant(
    allRecordsForShift,
    pileId,
    targetPosition,
    sourceRecord.transaction.id,
  )

  return ok({
    mode: targetOccupant ? 'SWAP' : 'MOVE',
    sourceRecord,
    targetRecord: targetOccupant,
    targetPosition,
  })
}

export interface ApplyProductionSwitchPlanParams {
  readonly plan: ProductionSwitchPlan
  readonly reason: string
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  readonly generateCorrectionId?: ProductionCorrectionIdGenerator
}

export interface ApplyProductionSwitchPlanResult {
  readonly updatedSource: ProductionRecord
  /** Present only for a SWAP. */
  readonly updatedTarget?: ProductionRecord
}

/**
 * Applies an already-planned Switch (Phase 4 §13/§14) via the domain
 * `applySwitchPosition` engine — once for the source (MOVE or SWAP) and,
 * for a SWAP, once more for the target, each getting its own before/after
 * snapshot but the identical `reason`/`correctedAt`/`correctedBy` (§14),
 * and (for traceability) the same generated correction id reused for both
 * sides of one SWAP operation. Never writes anything — the caller
 * persists both results atomically via
 * `ProductionCorrectionStore.switchProductionRecords`.
 */
export function applyProductionSwitchPlan(
  params: ApplyProductionSwitchPlanParams,
): Result<ApplyProductionSwitchPlanResult, DomainError> {
  const generate = params.generateCorrectionId ?? generateProductionCorrectionId
  const correctionIdResult = parseProductionCorrectionId(generate())
  if (!correctionIdResult.ok) {
    return correctionIdResult
  }

  const sourceResult = applySwitchPosition(params.plan.sourceRecord, {
    correctionId: correctionIdResult.value,
    targetPosition: params.plan.targetPosition,
    reason: params.reason,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  })
  if (!sourceResult.ok) {
    return sourceResult
  }

  if (!params.plan.targetRecord) {
    return ok({ updatedSource: sourceResult.value })
  }

  const targetResult = applySwitchPosition(params.plan.targetRecord, {
    correctionId: correctionIdResult.value,
    targetPosition: params.plan.sourceRecord.effective.batchPosition,
    reason: params.reason,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  })
  if (!targetResult.ok) {
    return targetResult
  }

  return ok({ updatedSource: sourceResult.value, updatedTarget: targetResult.value })
}
