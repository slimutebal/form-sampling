import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { selectActiveContinuationBatches } from '@/domain/handover/carry-over-pending-batch'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { deriveMissedRits, type MissedBatch } from '@/application/production/missed-rit'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { BatchSize } from '@/domain/master/sampling-config'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'

export const PRODUCTION_BATCH_STATUSES = ['ACTIVE', 'COMPLETE', 'PENDING'] as const
export type ProductionBatchStatus = (typeof PRODUCTION_BATCH_STATUSES)[number]

/**
 * Compact per-Batch summary for the Batch List and Batch Detail screens
 * (Phase 3 §5/§6). `acceptRitCount`/`rejectCount`/`sampleCount`/
 * `wrongTruckCount` follow the same rules as `ProductionPileSummary`
 * (Phase 3 §1), scoped to this one Batch.
 */
export interface ProductionBatchSummary {
  readonly batchNumber: BatchNumber
  readonly status: ProductionBatchStatus
  /** This Ore's configured capacity (`OreSamplingConfig.batchSize`) — never hardcoded per OreCode. */
  readonly batchSize: BatchSize
  readonly acceptRitCount: number
  readonly rejectCount: number
  readonly sampleCount: number
  readonly wrongTruckCount: number
  readonly missedRits: readonly RitNumber[]
}

/**
 * Builds every `ProductionBatchSummary` for one Pile (Phase 3 §5).
 * Fails with `ORE_SAMPLING_CONFIG_NOT_FOUND` if the Pile's Ore has no
 * configured BatchSize — never invents one (mirrors every other
 * Ore-config lookup in this codebase).
 *
 * Batch status (deliberately conservative — see the limitation note
 * below):
 *  - COMPLETE: the distinct ACCEPT + ACTIVE Rit count for this Batch has
 *    reached the configured BatchSize.
 *  - PENDING: not complete, has zero effective (ACCEPT + ACTIVE)
 *    production yet, but is a registered CONTINUE carry-over batch for
 *    this Pile (`selectActiveContinuationBatches`) — i.e. domain state
 *    positively confirms this Batch was already open before any
 *    production was recorded this shift.
 *  - ACTIVE: has at least one effective (ACCEPT + ACTIVE) record and is
 *    not complete.
 *
 * Limitation: a brand-new Batch that has never been recorded and has no
 * CONTINUE carry-over row (e.g. the Batch a fresh Pile will eventually
 * roll over into) carries no positive signal anywhere in current domain
 * state, so it is never listed as PENDING here — only a Batch that has
 * already produced at least one record, or that carry-over data
 * explicitly names, appears in this summary. Do not read the absence of
 * a future Batch from this list as "does not exist."
 */
export function deriveProductionBatchSummaries(
  pile: Pile,
  masterData: MasterData,
  productionRecords: readonly ProductionRecord[],
  pendingBatches: readonly PendingBatchCarryOver[] = [],
): Result<readonly ProductionBatchSummary[], DomainError> {
  const freshStartPosition = pile.freshPileStartPosition
  const oreSamplingConfig = findOreSamplingConfig(masterData, pile.oreCode)
  if (!oreSamplingConfig) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${pile.oreCode}`,
    })
  }
  const batchSize = oreSamplingConfig.batchSize

  const pileRecords = productionRecords.filter((record) => record.transaction.pileId === pile.id)

  const batchNumbers = new Set<number>()
  for (const record of pileRecords) {
    if (record.effective.disposition === 'ACCEPT' && record.effective.status === 'ACTIVE') {
      batchNumbers.add(Number(record.effective.batchPosition.batchNumber))
    }
  }
  for (const row of selectActiveContinuationBatches(pendingBatches)) {
    if (row.pile.id === pile.id) {
      batchNumbers.add(Number(row.pendingBatch.batchNumber))
    }
  }

  const sortedBatchNumbers = [...batchNumbers].sort((a, b) => a - b)

  const summaries = sortedBatchNumbers.map((batchNumberValue) => {
    const batchNumber = batchNumberValue as BatchNumber
    const batchRecords = pileRecords.filter(
      (record) => Number(record.effective.batchPosition.batchNumber) === batchNumberValue,
    )
    const effectiveBatchRecords = batchRecords.filter(
      (record) => record.effective.disposition === 'ACCEPT' && record.effective.status === 'ACTIVE',
    )
    const acceptedRits = new Set(
      effectiveBatchRecords.map((record) => Number(record.effective.batchPosition.ritNumber)),
    )
    const rejectCount = batchRecords.filter(
      (record) => record.effective.disposition === 'REJECT' && record.effective.status === 'ACTIVE',
    ).length
    const sampleCount = effectiveBatchRecords.filter(
      (record) => record.transaction.samplingEvaluation.sampleRequired,
    ).length
    const wrongTruckCount = batchRecords.filter(
      (record) => record.effective.status === 'ACTIVE' && record.effective.truckValidation.status === 'WRONG_TRUCK',
    ).length
    // Bounded to this Batch's own authoritative expected Rits (carry-over
    // Last_Rit / confirmed fresh-pile start / ordinary Rit 1 default) —
    // never a raw `1..maxAccepted` scan. A resolution failure here (e.g.
    // corrupted carry-over data placing Last_Rit beyond BatchSize) is
    // treated conservatively as "no expected Rits to check" rather than
    // failing this whole Pile's batch list.
    const expectedRitsResult = deriveExpectedRitsForBatch(pile, batchSize, pendingBatches, batchNumber, freshStartPosition)
    const missedRits = expectedRitsResult.ok
      ? deriveMissedRits(pileRecords, pile.id, batchNumber, expectedRitsResult.value)
      : []

    const acceptRitCount = acceptedRits.size
    const status: ProductionBatchStatus =
      acceptRitCount === 0 ? 'PENDING' : acceptRitCount >= Number(batchSize) ? 'COMPLETE' : 'ACTIVE'

    return {
      batchNumber,
      status,
      batchSize,
      acceptRitCount,
      rejectCount,
      sampleCount,
      wrongTruckCount,
      missedRits,
    }
  })

  return ok(summaries)
}

/**
 * Reshapes an already-computed `ProductionBatchSummary[]` (never
 * recomputed) into the `{batchNumber, missedRits}` pairs the Pile-level
 * missed-Rit warning needs — the single source of truth for "is this
 * Batch missed" is `deriveProductionBatchSummaries` itself; this is pure
 * data reshaping, not a second missed-Rit calculation.
 */
export function selectMissedBatches(batchSummaries: readonly ProductionBatchSummary[]): readonly MissedBatch[] {
  return batchSummaries
    .filter((summary) => summary.missedRits.length > 0)
    .map((summary) => ({ batchNumber: summary.batchNumber, missedRits: summary.missedRits }))
}
