import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { BatchSize } from '../master/sampling-config'
import type { BatchNumber } from './batch-number'
import type { RitNumber } from './rit-number'

/**
 * One haulage position in batch progression (BR-SAMPLE-003). Batch and
 * Rit remain separate numeric domain values — never combined into a
 * composite display string such as "024 / 012". That formatting is a
 * presentation concern.
 */
export interface BatchPosition {
  readonly batchNumber: BatchNumber
  readonly ritNumber: RitNumber
}

export function createBatchPosition(batchNumber: BatchNumber, ritNumber: RitNumber): BatchPosition {
  return { batchNumber, ritNumber }
}

/**
 * The first position (Rit 1) of an explicitly supplied BatchNumber.
 * Phase 4 must not invent an initial BatchNumber itself — the caller
 * is required to provide one (no confirmed rule establishes an
 * implicit starting batch).
 */
export function createInitialBatchPosition(batchNumber: BatchNumber): BatchPosition {
  return { batchNumber, ritNumber: 1 as RitNumber }
}

/**
 * Validates a BatchPosition against a configured BatchSize: the Rit
 * must not exceed the batch's capacity. This limit only exists in the
 * context of a specific configuration — it is not enforced by the
 * generic RitNumber type itself.
 */
export function validateBatchPosition(position: BatchPosition, batchSize: BatchSize): Result<BatchPosition, DomainError> {
  const rit = Number(position.ritNumber)
  const size = Number(batchSize)
  if (rit > size) {
    return err({
      code: 'RIT_EXCEEDS_BATCH_SIZE',
      message: `Rit ${rit} exceeds configured batch size ${size}`,
    })
  }
  return ok(position)
}
