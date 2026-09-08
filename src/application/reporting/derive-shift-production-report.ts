import { deriveEffectiveSamplingRequirement } from '@/application/production/production-sample-impact'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { ProductionSummaryRow, ProductionTotals } from './report-types'

/**
 * Builds the Production Summary row for one Pile (Phase 22 §2) from
 * `ProductionRecord[]`, never raw `HaulageTransaction[]` (§1). Only
 * effective (ACCEPT + ACTIVE) records count as production — a REJECT, a
 * VOIDED record, or a stale pre-correction position never contributes.
 * `rit`/`wrongTruck` are read straight off `effective.*`; `batch` is the
 * distinct count of `effective.batchPosition.batchNumber` (so a
 * SWITCH_POSITION correction reports at its *current* Batch, never the
 * one the transaction originally recorded); `increment` uses the
 * *effective* sampling requirement for the record's current position
 * (`deriveEffectiveSamplingRequirement`), never the transaction's own
 * immutable `samplingEvaluation` snapshot (§6) — a MOVE/SWAP correction
 * can change whether a position lands on a sample Rit.
 */
export function derivePileProductionReport(
  pile: Pile,
  masterData: MasterData,
  productionRecords: readonly ProductionRecord[],
): Result<ProductionSummaryRow, DomainError> {
  const effectiveRecords = productionRecords.filter(
    (record) =>
      record.transaction.pileId === pile.id &&
      record.effective.disposition === 'ACCEPT' &&
      record.effective.status === 'ACTIVE',
  )

  const distinctBatchNumbers = new Set(effectiveRecords.map((record) => Number(record.effective.batchPosition.batchNumber)))
  const wrongTruck = effectiveRecords.filter((record) => record.effective.truckValidation.status === 'WRONG_TRUCK').length

  let increment = 0
  for (const record of effectiveRecords) {
    const requirement = deriveEffectiveSamplingRequirement(pile, masterData, record.effective.batchPosition)
    if (!requirement.ok) {
      return requirement
    }
    if (requirement.value.sampleRequired) {
      increment += 1
    }
  }

  return ok({
    pileId: pile.id,
    oreCode: pile.oreCode,
    rit: effectiveRecords.length,
    batch: distinctBatchNumbers.size,
    increment,
    wrongTruck,
  })
}

/**
 * Builds every Pile's Production Summary row plus the pile-local totals
 * (Phase 22 §2/§5) — Batch identity stays pile-local, so `totals.batch` is
 * the SUM of each Pile's own distinct Batch count, never one global Set.
 * Only Piles with at least one effective (ACCEPT + ACTIVE) record get a
 * row, in caller Pile order — unchanged from the pre-Phase-22 contract.
 */
export function deriveShiftProductionReport(
  piles: readonly Pile[],
  masterData: MasterData,
  productionRecords: readonly ProductionRecord[],
): Result<{ readonly summary: readonly ProductionSummaryRow[]; readonly totals: ProductionTotals }, DomainError> {
  const summary: ProductionSummaryRow[] = []

  for (const pile of piles) {
    const hasEffectiveProduction = productionRecords.some(
      (record) =>
        record.transaction.pileId === pile.id &&
        record.effective.disposition === 'ACCEPT' &&
        record.effective.status === 'ACTIVE',
    )
    if (!hasEffectiveProduction) continue

    const row = derivePileProductionReport(pile, masterData, productionRecords)
    if (!row.ok) {
      return row
    }
    summary.push(row.value)
  }

  const totals: ProductionTotals = summary.reduce<ProductionTotals>(
    (acc, row) => ({
      rit: acc.rit + row.rit,
      batch: acc.batch + row.batch,
      increment: acc.increment + row.increment,
      wrongTruck: acc.wrongTruck + row.wrongTruck,
    }),
    { rit: 0, batch: 0, increment: 0, wrongTruck: 0 },
  )

  return ok({ summary, totals })
}
