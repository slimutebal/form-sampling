import type { BatchNumber } from '@/domain/batch/batch-number'
import type { OreCode } from '@/domain/common/codes'
import type { PileId } from '@/domain/common/identifiers'
import { selectMissedBatches, type ProductionBatchSummary } from '@/application/production/production-batch-summary'
import type { PendingSamplePile } from '@/application/sample-handling/derive-pending-samples'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Compact per-Pile summary for the Production Detail landing card and
 * the Selected Pile Detail screen (Phase 3). Every count here is
 * derived from effective (ACCEPT + ACTIVE) ProductionRecord state, not
 * raw HaulageTransaction counts — see field docs for the exact rule
 * each one follows.
 */
export interface ProductionPileSummary {
  readonly pileId: PileId
  readonly oreCode: OreCode
  /** Count of distinct Batch numbers with >=1 ACCEPT + ACTIVE effective ProductionRecord. */
  readonly batchTotal: number
  /** Count of ACCEPT + ACTIVE effective ProductionRecords (a filled Rit position). */
  readonly acceptRitCount: number
  /** Count of REJECT ProductionRecords with ACTIVE status. VOIDED rejects (future) are never counted. */
  readonly rejectCount: number
  /** Event-level count of ACTIVE ProductionRecords (any disposition) whose effective Front/Truck classifies WRONG_TRUCK (`effective.truckValidation` — the original snapshot until a Phase 4 EDIT_FIELDS correction changes Front/Truck, the re-classified result afterward). */
  readonly wrongTruckCount: number
  /** Count of ACCEPT + ACTIVE effective ProductionRecords whose transaction.samplingEvaluation.sampleRequired is true. */
  readonly sampleTotal: number
  /** Reuses `derivePendingSamples` (sample-handling) — never recomputed here. */
  readonly pendingSampleCount: number
  /** Every Batch number with >=1 missed Rit (`selectMissedBatches`), ascending. Empty when the Pile has no missed Rit. */
  readonly missedBatchNumbers: readonly BatchNumber[]
}

/**
 * Builds one Pile's `ProductionPileSummary` from the Shift's full
 * ProductionRecord set (filtered internally to this Pile), the
 * already-computed `derivePendingSamples` output for the Shift, and the
 * already-computed `deriveProductionBatchSummaries` output for this Pile
 * — the caller resolves both of those once and passes the results in
 * here; this function never re-derives sample-delivery logic nor
 * missed-Rit logic itself (Phase 3 §1) — `missedBatchNumbers` is reshaped
 * from `batchSummaries` via `selectMissedBatches`, never recomputed with
 * its own `1..N` scan.
 */
export function deriveProductionPileSummary(
  pile: Pile,
  productionRecords: readonly ProductionRecord[],
  pendingSamplePiles: readonly PendingSamplePile[],
  batchSummaries: readonly ProductionBatchSummary[],
): ProductionPileSummary {
  const pileRecords = productionRecords.filter((record) => record.transaction.pileId === pile.id)

  const effectiveRecords = pileRecords.filter(
    (record) => record.effective.disposition === 'ACCEPT' && record.effective.status === 'ACTIVE',
  )

  const batchNumbers = new Set(effectiveRecords.map((record) => Number(record.effective.batchPosition.batchNumber)))

  const rejectCount = pileRecords.filter(
    (record) => record.effective.disposition === 'REJECT' && record.effective.status === 'ACTIVE',
  ).length

  const wrongTruckCount = pileRecords.filter(
    (record) => record.effective.status === 'ACTIVE' && record.effective.truckValidation.status === 'WRONG_TRUCK',
  ).length

  const sampleTotal = effectiveRecords.filter((record) => record.transaction.samplingEvaluation.sampleRequired).length

  const pendingSampleCount = (
    pendingSamplePiles.find((pendingPile) => pendingPile.pile.id === pile.id)?.batches ?? []
  ).reduce((total, batch) => total + batch.pendingRitNumbers.length, 0)

  const missedBatchNumbers = selectMissedBatches(batchSummaries).map((batch) => batch.batchNumber)

  return {
    pileId: pile.id,
    oreCode: pile.oreCode,
    batchTotal: batchNumbers.size,
    acceptRitCount: effectiveRecords.length,
    rejectCount,
    wrongTruckCount,
    sampleTotal,
    pendingSampleCount,
    missedBatchNumbers,
  }
}
