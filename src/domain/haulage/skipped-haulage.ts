import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { PileId, ShiftId } from '../common/identifiers'
import type { BatchPosition } from '../batch/batch-position'
import type { HaulageTransaction } from './haulage-transaction'

function batchPositionKey(position: BatchPosition): string {
  return `${Number(position.batchNumber)}/${Number(position.ritNumber)}`
}

export interface FindSkippedHaulagePositionsParams {
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly expectedPositions: readonly BatchPosition[]
  readonly transactions: readonly HaulageTransaction[]
}

/**
 * Detects skipped haulage positions (BR-SKIP-001/002/003) against an
 * explicitly supplied, authoritative expected sequence — never
 * synthesized from arithmetic BatchNumber gaps, so legitimately
 * non-contiguous pending batch numbers are never treated as missing
 * positions. Scoped to one Shift/Pile: transactions belonging to
 * another Shift or another Pile never affect the result.
 *
 * A missing expected position is SKIPPED_HAULAGE only when some later
 * position in the expected sequence has a matching recorded transaction
 * (BR-SKIP-001). An unrecorded tail — no later expected position has
 * been recorded yet — is never classified skipped (BR-SKIP-002), which
 * avoids false positives on a rit that is simply awaiting input.
 *
 * Fails explicitly rather than silently coping with ambiguous input:
 *  - DUPLICATE_EXPECTED_HAULAGE_POSITION when expectedPositions contains
 *    the same BatchPosition more than once;
 *  - RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE when an in-scope
 *    transaction's BatchPosition is not present in expectedPositions —
 *    this protects detection from running against a mismatched planning
 *    context rather than silently ignoring the transaction.
 *
 * Multiple recorded transactions sharing the same expected BatchPosition
 * are not an error here — the existence of at least one matching
 * recorded transaction is sufficient to mark that position recorded.
 * Correction/delete policy for duplicate BatchPosition recordings is
 * NEEDS_CONFIRMATION (BUSINESS_RULES.md §28) and is not decided by this
 * function.
 *
 * Never mutates or reorders `expectedPositions` or `transactions`.
 */
export function findSkippedHaulagePositions(
  params: FindSkippedHaulagePositionsParams,
): Result<readonly BatchPosition[], DomainError> {
  const { shiftId, pileId, expectedPositions, transactions } = params

  const expectedKeys = new Set<string>()
  for (const position of expectedPositions) {
    const key = batchPositionKey(position)
    if (expectedKeys.has(key)) {
      return err({
        code: 'DUPLICATE_EXPECTED_HAULAGE_POSITION',
        message: `Expected haulage position Batch ${Number(position.batchNumber)} / Rit ${Number(position.ritNumber)} appears more than once`,
      })
    }
    expectedKeys.add(key)
  }

  const recordedKeys = new Set<string>()
  for (const transaction of transactions) {
    if (transaction.shiftId !== shiftId || transaction.pileId !== pileId) {
      continue
    }
    const key = batchPositionKey(transaction.batchPosition)
    if (!expectedKeys.has(key)) {
      return err({
        code: 'RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE',
        message: `Recorded haulage position Batch ${Number(transaction.batchPosition.batchNumber)} / Rit ${Number(transaction.batchPosition.ritNumber)} is not present in the expected sequence`,
      })
    }
    recordedKeys.add(key)
  }

  const skippedReversed: BatchPosition[] = []
  let anyLaterRecorded = false
  for (let i = expectedPositions.length - 1; i >= 0; i--) {
    const position = expectedPositions[i]
    if (recordedKeys.has(batchPositionKey(position))) {
      anyLaterRecorded = true
      continue
    }
    if (anyLaterRecorded) {
      skippedReversed.push(position)
    }
  }

  return ok(skippedReversed.reverse())
}
