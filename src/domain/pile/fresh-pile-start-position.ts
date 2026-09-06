import { parseBatchNumber, type BatchNumber } from '../batch/batch-number'
import { parseRitNumber, type RitNumber } from '../batch/rit-number'
import type { DomainError, Result } from '../common/result'
import { ok } from '../common/result'

/**
 * The confirmed starting Batch/Rit for a truly fresh Pile — no handover
 * pending, no prior continuation/history, no existing haulage
 * (post-inspection correction §6). Defaults to Batch 1 / Rit 1, but the
 * operator/supervisor may override both before the first haulage
 * transaction is saved for this Pile. Validation reuses the existing
 * BatchNumber/RitNumber value objects/ranges — no new range rule is
 * invented here.
 */
export interface FreshPileStartPosition {
  readonly batchNumber: BatchNumber
  readonly ritNumber: RitNumber
}

/** Confirmed default: Batch 001 / Rit 001. */
export function createDefaultFreshPileStartPosition(): FreshPileStartPosition {
  return { batchNumber: 1 as BatchNumber, ritNumber: 1 as RitNumber }
}

export function parseFreshPileStartPosition(
  batchNumber: number,
  ritNumber: number,
): Result<FreshPileStartPosition, DomainError> {
  const parsedBatchNumber = parseBatchNumber(batchNumber)
  if (!parsedBatchNumber.ok) return parsedBatchNumber
  const parsedRitNumber = parseRitNumber(ritNumber)
  if (!parsedRitNumber.ok) return parsedRitNumber
  return ok({ batchNumber: parsedBatchNumber.value, ritNumber: parsedRitNumber.value })
}
