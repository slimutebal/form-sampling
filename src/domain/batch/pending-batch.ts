import type { PileId } from '../common/identifiers'
import type { BatchNumber } from './batch-number'
import type { PendingStatus } from './pending-status'
import type { RitNumber } from './rit-number'

/**
 * A single unfinished batch carried over for a pile (BR-PEND-002/003).
 * One pile can have several of these simultaneously — this type
 * intentionally has no "current"/"latest" concept baked in.
 */
export interface PendingBatch {
  readonly pileId: PileId
  readonly batchNumber: BatchNumber
  readonly lastRit: RitNumber
  readonly status: PendingStatus
}

export function createPendingBatch(params: {
  pileId: PileId
  batchNumber: BatchNumber
  lastRit: RitNumber
  status: PendingStatus
}): PendingBatch {
  return { ...params }
}

/**
 * Deterministic numeric ordering by batch number (BR-PEND-004).
 * Does not mutate the input array.
 */
export function sortPendingBatchesByBatchNumber(batches: readonly PendingBatch[]): PendingBatch[] {
  return [...batches].sort((a, b) => a.batchNumber - b.batchNumber)
}
