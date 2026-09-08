import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * True when a ProductionRecord counts as normal, in-force production
 * (Production Data Model): ACCEPT disposition and ACTIVE status. A
 * legacy migrated record (`createLegacyProductionRecord`) is always
 * ACCEPT + ACTIVE, so it is always effective — this is the one place
 * that rule is encoded for every downstream consumer, rather than each
 * caller re-deriving it. A REJECT record (does not consume a production
 * position) and a future VOIDED record are never effective.
 */
export function isEffectiveProductionRecord(record: ProductionRecord): boolean {
  return record.effective.disposition === 'ACCEPT' && record.effective.status === 'ACTIVE'
}

/**
 * Narrows a list of ProductionRecords to only the ones that count as
 * effective production (`isEffectiveProductionRecord`).
 */
export function selectEffectiveProductionRecords(
  records: readonly ProductionRecord[],
): readonly ProductionRecord[] {
  return records.filter(isEffectiveProductionRecord)
}

/**
 * Extracts the original HaulageTransaction from every effective
 * (ACCEPT + ACTIVE) ProductionRecord. This is the transaction set that
 * progress/pending-sample derivation (`deriveHaulageProgress`,
 * `derivePendingSamples`, `deriveCurrentBatchSampleCount`) must be fed —
 * never the raw, unfiltered HaulageTransaction table — so a REJECT (or
 * future VOIDED) record never advances a production position or
 * generates a pending physical sample, while its own HaulageTransaction
 * snapshot (and the SamplingEvaluation recorded on it) is still
 * preserved untouched for audit.
 */
export function selectEffectiveTransactions(
  records: readonly ProductionRecord[],
): readonly HaulageTransaction[] {
  return selectEffectiveProductionRecords(records).map((record) => record.transaction)
}
