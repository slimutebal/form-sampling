import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { deriveProductionBatchSummaries } from '@/application/production/production-batch-summary'
import type { ProductionRecord } from '@/domain/production/production-record'

/** One Batch's authoritative switch-target Rit numbers, for the Switch Record target selector (Phase 4 §11). */
export interface ProductionSwitchTargetBatch {
  readonly batchNumber: BatchNumber
  readonly ritNumbers: readonly RitNumber[]
}

/**
 * Builds the authoritative Target Batch/Rit options for Switch Record
 * (Phase 4 §11 "Target Batch/Rit must come from valid expected
 * production positions for the same Pile. Do NOT allow free-text Rit.").
 * Reuses `deriveProductionBatchSummaries` (the same known-Batch list the
 * Batch List screen already shows — production history or a CONTINUE
 * carry-over row) for the set of Batch numbers, and
 * `deriveExpectedRitsForBatch` for each Batch's own authoritative
 * expected Rits — never a raw `1..BatchSize` scan and never a second
 * Batch-discovery implementation.
 */
export function deriveProductionSwitchTargets(
  pile: Pile,
  masterData: MasterData,
  productionRecords: readonly ProductionRecord[],
  pendingBatches: readonly PendingBatchCarryOver[] = [],
): Result<readonly ProductionSwitchTargetBatch[], DomainError> {
  const batchSummariesResult = deriveProductionBatchSummaries(pile, masterData, productionRecords, pendingBatches)
  if (!batchSummariesResult.ok) {
    return batchSummariesResult
  }

  const targets: ProductionSwitchTargetBatch[] = []
  for (const summary of batchSummariesResult.value) {
    const expectedRitsResult = deriveExpectedRitsForBatch(
      pile,
      summary.batchSize,
      pendingBatches,
      summary.batchNumber,
      pile.freshPileStartPosition,
    )
    if (!expectedRitsResult.ok) {
      return expectedRitsResult
    }
    targets.push({ batchNumber: summary.batchNumber, ritNumbers: expectedRitsResult.value })
  }
  return ok(targets)
}
