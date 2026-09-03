import type { Brand } from '../common/brand'
import type { Result } from '../common/result'
import { ok } from '../common/result'
import { parsePositiveInteger } from '../common/validators'

/**
 * A batch's sequence number. Positive integers only — no maximum is
 * defined here since none is confirmed as an operational requirement.
 */
export type BatchNumber = Brand<number, 'BatchNumber'>

export function parseBatchNumber(value: number): Result<BatchNumber> {
  const parsed = parsePositiveInteger('Batch number', 'INVALID_BATCH_NUMBER', value)
  if (!parsed.ok) {
    return parsed
  }
  return ok(parsed.value as BatchNumber)
}
