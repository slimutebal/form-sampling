import type { BatchNumber } from '@/domain/batch/batch-number'
import type { PileId, ShiftId } from '@/domain/common/identifiers'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { OreSamplingConfig } from '@/domain/master/sampling-config'
import { maxSampleIncrementsForBatch } from '@/domain/sampling/sampling-engine'

export interface CurrentBatchSampleCount {
  /** Distinct expected positions in this batch already recorded with a sample result (Sample = YES). */
  readonly sampled: number
  /** The batch's configured maximum sample increments (`floor(BatchSize / SamplingInterval)`). */
  readonly max: number
}

/**
 * Compact "SAMPEL x/y" count for the current active batch (Phase 18 §8):
 * counts *positions* (distinct RitNumbers), not transactions — a
 * position recorded more than once (e.g. a wrong-truck correction) is
 * still one sampled position. Reuses `maxSampleIncrementsForBatch`
 * (Phase 4 sampling engine) for the denominator rather than
 * recalculating SAP/LIM-specific business rules here. Independent of
 * where the batch's starting Rit came from (fresh-pile override or
 * ordinary continuation) — it only ever looks at what was actually
 * recorded.
 */
export function deriveCurrentBatchSampleCount(
  transactions: readonly HaulageTransaction[],
  shiftId: ShiftId,
  pileId: PileId,
  batchNumber: BatchNumber,
  config: OreSamplingConfig,
): CurrentBatchSampleCount {
  const sampledRitNumbers = new Set<number>()
  for (const transaction of transactions) {
    if (transaction.shiftId !== shiftId || transaction.pileId !== pileId) continue
    if (Number(transaction.batchPosition.batchNumber) !== Number(batchNumber)) continue
    if (!transaction.samplingEvaluation.sampleRequired) continue
    sampledRitNumbers.add(Number(transaction.batchPosition.ritNumber))
  }

  return {
    sampled: sampledRitNumbers.size,
    max: maxSampleIncrementsForBatch(config.batchSize, config.interval),
  }
}
