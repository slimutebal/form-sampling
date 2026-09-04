import type { BatchPosition } from '@/domain/batch/batch-position'
import type { PileId, ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { findSkippedHaulagePositions } from '@/domain/haulage/skipped-haulage'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'

function positionKey(position: BatchPosition): string {
  return `${Number(position.batchNumber)}/${Number(position.ritNumber)}`
}

/** One expected position that has at least one recorded transaction. */
export interface RecordedHaulagePosition {
  readonly position: BatchPosition
  readonly transactions: readonly HaulageTransaction[]
}

export interface DeriveHaulageProgressParams {
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly expectedPositions: readonly BatchPosition[]
  readonly transactions: readonly HaulageTransaction[]
}

export interface HaulageProgress {
  /** The next position the operator should record. `undefined` when the plan is exhausted. */
  readonly nextPosition: BatchPosition | undefined
  /** Expected positions with >=1 recorded transaction, in expectedPositions plan order. */
  readonly recordedPositions: readonly RecordedHaulagePosition[]
  /** BR-SKIP-001/002: an internal gap with a later recorded position. Reuses the Phase 6 rule verbatim. */
  readonly skippedPositions: readonly BatchPosition[]
  /** True once the furthest recorded expected position is the last one in the plan. */
  readonly planExhausted: boolean
}

/**
 * Derives operational progress for one Shift/Pile from an authoritative,
 * caller-supplied expected position sequence plus the persisted
 * HaulageTransaction snapshot (docs/ROADMAP.md Phase 10 §11).
 *
 * Rules:
 *  - `expectedPositions` order is authoritative — never inferred from
 *    `transactions` array/storage order.
 *  - `nextPosition` is derived from the *furthest* expected position
 *    that has at least one recorded transaction, not from the first gap:
 *    an earlier missing position may already be SKIPPED once a later
 *    position has been recorded, and the engine must never return to
 *    that earlier gap as "next".
 *  - Skipped classification reuses `findSkippedHaulagePositions` (Phase
 *    6) verbatim — this function does not reimplement that rule.
 *  - An empty `expectedPositions` fails explicitly with
 *    HAULAGE_PLAN_EMPTY — no Batch/Rit is invented.
 *  - Duplicate expected positions and recorded positions outside the
 *    expected sequence fail explicitly (surfaced by
 *    findSkippedHaulagePositions as DUPLICATE_EXPECTED_HAULAGE_POSITION
 *    / RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE).
 *  - Multiple transactions recorded at the same expected position are
 *    not an error here — the position is simply "recorded"; no
 *    correction/replacement semantics are invented.
 */
export function deriveHaulageProgress(params: DeriveHaulageProgressParams): Result<HaulageProgress, DomainError> {
  const { shiftId, pileId, expectedPositions, transactions } = params

  if (expectedPositions.length === 0) {
    return err({
      code: 'HAULAGE_PLAN_EMPTY',
      message: `No expected haulage positions are configured for PileId ${pileId}`,
    })
  }

  const skippedResult = findSkippedHaulagePositions({ shiftId, pileId, expectedPositions, transactions })
  if (!skippedResult.ok) {
    return skippedResult
  }

  const transactionsByPosition = new Map<string, HaulageTransaction[]>()
  for (const transaction of transactions) {
    if (transaction.shiftId !== shiftId || transaction.pileId !== pileId) {
      continue
    }
    const key = positionKey(transaction.batchPosition)
    const existing = transactionsByPosition.get(key)
    if (existing) {
      existing.push(transaction)
    } else {
      transactionsByPosition.set(key, [transaction])
    }
  }

  const recordedPositions: RecordedHaulagePosition[] = []
  let furthestRecordedIndex = -1
  expectedPositions.forEach((position, index) => {
    const matching = transactionsByPosition.get(positionKey(position))
    if (matching && matching.length > 0) {
      recordedPositions.push({ position, transactions: matching })
      furthestRecordedIndex = index
    }
  })

  const planExhausted = furthestRecordedIndex === expectedPositions.length - 1
  const nextPosition = planExhausted ? undefined : expectedPositions[furthestRecordedIndex + 1]

  return ok({
    nextPosition,
    recordedPositions,
    skippedPositions: skippedResult.value,
    planExhausted,
  })
}
