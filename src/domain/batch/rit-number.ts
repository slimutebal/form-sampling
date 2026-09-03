import type { Brand } from '../common/brand'
import type { Result } from '../common/result'
import { ok } from '../common/result'
import { parsePositiveInteger } from '../common/validators'

/**
 * A generic haulage rit number within a batch. Positive integers only.
 * Ore-specific batch-size limits (e.g. SAP=20, LIM=100) are master-data
 * / sampling-engine concerns and must not be enforced here.
 */
export type RitNumber = Brand<number, 'RitNumber'>

export function parseRitNumber(value: number): Result<RitNumber> {
  const parsed = parsePositiveInteger('Rit number', 'INVALID_RIT_NUMBER', value)
  if (!parsed.ok) {
    return parsed
  }
  return ok(parsed.value as RitNumber)
}
