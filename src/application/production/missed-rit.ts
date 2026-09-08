import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { PileId } from '@/domain/common/identifiers'
import { isEffectiveProductionRecord } from '@/application/production/effective-production'
import type { ProductionRecord } from '@/domain/production/production-record'

/** One Batch's missed Rit numbers for a Pile, ascending; only ever non-empty. */
export interface MissedBatch {
  readonly batchNumber: BatchNumber
  readonly missedRits: readonly RitNumber[]
}

/**
 * Derives the missed Rit numbers for one Pile/Batch from effective
 * (ACCEPT + ACTIVE) ProductionRecord state (Phase 3 — Production Detail
 * + Missed Rit Warning; hardened against non-Rit-1 operational starting
 * positions).
 *
 * `expectedRits` is the authoritative set of Rit numbers this Batch is
 * actually operating over — from `deriveExpectedRitsForBatch`
 * (`@/application/haulage-operation/derive-pile-haulage-plan`), which
 * resolves a carry-over Last_Rit or a confirmed fresh-pile starting Rit
 * before ever defaulting to Rit 1. This function never invents that
 * range itself (never scans a raw `1..maxAccepted` window) — that was
 * the pre-hardening bug: a carry-over Batch starting at Rit 11, or a
 * fresh Pile confirmed to start at Rit 5, must never have Rits before
 * its own operational start reported as missed.
 *
 * The confirmed rule, now bounded to `expectedRits`: an expected Rit N
 * is MISSED when no ACCEPT + ACTIVE ProductionRecord occupies Rit N, AND
 * at least one ACCEPT + ACTIVE ProductionRecord occupies an expected Rit
 * greater than N. A trailing expected position with nothing recorded
 * yet (or only REJECT attempts, which never fill a position) is never
 * MISSED — it is simply not yet reached. A REJECT or VOIDED record
 * never fills a position, however many attempts exist at that Rit, so
 * repeated REJECT attempts at the same Rit leave it MISSED exactly the
 * same as zero attempts, once a later expected Rit is accepted.
 *
 * Uses `effective.batchPosition`, never `transaction.batchPosition` —
 * the two are equal today (no correction feature exists yet), but a
 * future SWITCH_POSITION correction is only ever reflected in
 * `effective`, and missed-Rit detection must follow the corrected
 * position, not the immutable original transaction.
 *
 * `pileId` is read from `record.transaction.pileId` — Pile/Shift
 * identity is not part of `ProductionEffectiveFields` and is never
 * expected to move under a correction.
 */
export function deriveMissedRits(
  records: readonly ProductionRecord[],
  pileId: PileId,
  batchNumber: BatchNumber,
  expectedRits: readonly RitNumber[],
): readonly RitNumber[] {
  const acceptedRits = new Set<number>()
  for (const record of records) {
    if (record.transaction.pileId !== pileId) continue
    if (Number(record.effective.batchPosition.batchNumber) !== Number(batchNumber)) continue
    if (!isEffectiveProductionRecord(record)) continue
    acceptedRits.add(Number(record.effective.batchPosition.ritNumber))
  }

  if (acceptedRits.size === 0) {
    return []
  }

  const furthestAccepted = Math.max(...acceptedRits)
  return expectedRits
    .filter((rit) => Number(rit) < furthestAccepted && !acceptedRits.has(Number(rit)))
    .slice()
    .sort((a, b) => Number(a) - Number(b))
}
