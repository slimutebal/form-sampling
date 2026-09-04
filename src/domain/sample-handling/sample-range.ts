import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { BatchSize, SamplingInterval } from '../master/sampling-config'
import type { RitNumber } from '../batch/rit-number'

export interface BuildSampleRangeParams {
  readonly ritFrom: RitNumber
  readonly ritTo: RitNumber
  readonly interval: SamplingInterval
  readonly batchSize: BatchSize
}

/**
 * A validated Sample Position range (BR-SP-001/003). `ritFrom`/`ritTo`
 * are the operator-selected boundary, and `sampledRitNumbers` is the
 * generated sequence within that boundary that lands on a sampling
 * interval point. `ritFrom`/`ritTo` themselves are not required to be
 * sample points — no such invariant is confirmed (docs/ROADMAP.md Phase
 * 11 §11).
 */
export interface SampleRange {
  readonly ritFrom: RitNumber
  readonly ritTo: RitNumber
  readonly sampledRitNumbers: readonly RitNumber[]
}

/**
 * Builds the sampled-Rit sequence for a Sample Position range
 * (BR-SP-003). Mirrors `remainingPositionsForSeed`
 * (`@/domain/batch/batch-engine`) in structure: a plain loop over the
 * inclusive Rit range, generating output rather than reinterpreting
 * Excel formulas.
 *
 * Fails explicitly rather than silently normalizing invalid input:
 *  - SAMPLE_RANGE_REVERSED when ritFrom > ritTo;
 *  - SAMPLE_RANGE_EXCEEDS_BATCH_SIZE when either boundary exceeds the
 *    configured BatchSize;
 *  - SAMPLE_RANGE_HAS_NO_SAMPLE_POSITION when the inclusive range
 *    contains no Rit divisible by the configured SamplingInterval.
 *
 * Never mutates its inputs.
 */
export function buildSampleRange(params: BuildSampleRangeParams): Result<SampleRange, DomainError> {
  const from = Number(params.ritFrom)
  const to = Number(params.ritTo)
  const size = Number(params.batchSize)
  const interval = Number(params.interval)

  if (from > to) {
    return err({
      code: 'SAMPLE_RANGE_REVERSED',
      message: `Rit From ${from} must not be greater than Rit To ${to}`,
    })
  }

  if (from > size || to > size) {
    return err({
      code: 'SAMPLE_RANGE_EXCEEDS_BATCH_SIZE',
      message: `Sample range ${from}-${to} exceeds configured batch size ${size}`,
    })
  }

  const sampledRitNumbers: RitNumber[] = []
  for (let rit = from; rit <= to; rit++) {
    if (rit % interval === 0) {
      sampledRitNumbers.push(rit as RitNumber)
    }
  }

  if (sampledRitNumbers.length === 0) {
    return err({
      code: 'SAMPLE_RANGE_HAS_NO_SAMPLE_POSITION',
      message: `Range ${from}-${to} contains no sample position for sampling interval ${interval}`,
    })
  }

  return ok({ ritFrom: params.ritFrom, ritTo: params.ritTo, sampledRitNumbers })
}
