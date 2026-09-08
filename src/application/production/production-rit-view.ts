import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { PileId } from '@/domain/common/identifiers'
import { deriveMissedRits } from '@/application/production/missed-rit'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * One Rit position's effective production view for the Ritase List
 * (Phase 3 §7). Represents the *position*, not one transaction row: a
 * position with a filled ACCEPT + ACTIVE record is "accepted", one with
 * only REJECT attempts (or none at all) and a later ACCEPT elsewhere is
 * "missed" — either way, every REJECT attempt recorded at this Rit is
 * still exposed via `rejectAttempts` for audit/history, never rendered
 * as a second production slot (Phase 3 §7/§11).
 */
export interface ProductionRitView {
  readonly ritNumber: RitNumber
  /** The ACCEPT + ACTIVE record occupying this Rit, if any. */
  readonly acceptedRecord: ProductionRecord | undefined
  /** Every REJECT ProductionRecord (ACTIVE status) recorded at this Rit, in no particular guaranteed order beyond input order. */
  readonly rejectAttempts: readonly ProductionRecord[]
  /**
   * Every VOIDED ProductionRecord (any original disposition) recorded at
   * this Rit (Phase 4 §20/§22) — a VOID_RECORD correction never fills a
   * position and never counts as production, but the record itself must
   * remain reachable for audit ("remains visible in History/Audit"), so
   * it is still exposed here even though `acceptedRecord`/`rejectAttempts`
   * (both ACTIVE-only) can never include it.
   */
  readonly voidedRecords: readonly ProductionRecord[]
  /** True exactly when `deriveMissedRits` classifies this Rit as missed — always false when `acceptedRecord` is set. */
  readonly missed: boolean
}

/**
 * Builds the ascending Rit-by-Rit view for one Pile/Batch (Phase 3 §7;
 * hardened against non-Rit-1 operational starting positions).
 *
 * `expectedRits` is this Batch's authoritative expected Rit numbers
 * (`deriveExpectedRitsForBatch`) — never an invented `1..N` range, so a
 * carry-over Batch starting at Rit 11 (say) never renders phantom rows
 * for Rits 1-10 that were never part of this Batch's operational range.
 * The view only ever includes expected Rits up to the furthest Rit that
 * has ANY record (ACTIVE or VOIDED) — a later expected Rit that has never
 * been attempted is not yet part of this Batch's history, so it is never
 * included here. A VOIDED record still counts for this "furthest
 * attempted" purpose (Phase 4 §22 — its history must remain reachable
 * even if it is the only thing ever recorded at that Rit), even though it
 * can never be `acceptedRecord`/a `rejectAttempts` entry (both ACTIVE-only).
 */
export function deriveProductionRitViews(
  records: readonly ProductionRecord[],
  pileId: PileId,
  batchNumber: BatchNumber,
  expectedRits: readonly RitNumber[],
): readonly ProductionRitView[] {
  const batchRecords = records.filter(
    (record) =>
      record.transaction.pileId === pileId &&
      Number(record.effective.batchPosition.batchNumber) === Number(batchNumber),
  )

  const missedRits = new Set(deriveMissedRits(records, pileId, batchNumber, expectedRits).map(Number))

  const furthestRit = batchRecords.reduce(
    (max, record) => Math.max(max, Number(record.effective.batchPosition.ritNumber)),
    0,
  )

  const attemptedExpectedRits = expectedRits
    .map((rit) => Number(rit))
    .filter((rit) => rit <= furthestRit)
    .sort((a, b) => a - b)

  const views: ProductionRitView[] = []
  for (const ritValue of attemptedExpectedRits) {
    const atRit = batchRecords.filter((record) => Number(record.effective.batchPosition.ritNumber) === ritValue)
    const activeAtRit = atRit.filter((record) => record.effective.status === 'ACTIVE')
    const acceptedRecord = activeAtRit.find((record) => record.effective.disposition === 'ACCEPT')
    const rejectAttempts = activeAtRit.filter((record) => record.effective.disposition === 'REJECT')
    const voidedRecords = atRit.filter((record) => record.effective.status === 'VOIDED')

    views.push({
      ritNumber: ritValue as RitNumber,
      acceptedRecord,
      rejectAttempts,
      voidedRecords,
      missed: missedRits.has(ritValue),
    })
  }
  return views
}
