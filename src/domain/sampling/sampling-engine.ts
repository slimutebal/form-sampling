import type { Brand } from '../common/brand'
import type { RitNumber } from '../batch/rit-number'
import type { SamplingInterval } from '../master/sampling-config'

/**
 * Ordinal position of a sampled Rit within its sampling sequence
 * (BR-SAMPLE-003). Always a positive integer; resets naturally with
 * Rit because Rit itself resets when a new batch begins.
 */
export type SampleIncrementNumber = Brand<number, 'SampleIncrementNumber'>

/**
 * BR-SAMPLE-001: a Rit requires sampling when Rit MOD SamplingInterval
 * equals zero. Driven entirely by the configured interval — no OreCode
 * branching, so this works for any current or future ore configuration.
 */
export function isSampleRequired(rit: RitNumber, interval: SamplingInterval): boolean {
  return Number(rit) % Number(interval) === 0
}

/**
 * Result of evaluating one Rit against a SamplingInterval. The
 * discriminated union makes the contradictory state
 * (sampleRequired === false with an incrementNumber present)
 * impossible to construct.
 */
export type SamplingEvaluation =
  | { readonly sampleRequired: true; readonly incrementNumber: SampleIncrementNumber }
  | { readonly sampleRequired: false }

/**
 * Evaluates whether a Rit is a sample point and, when it is, its
 * increment ordinal within the batch (BR-SAMPLE-001, BR-SAMPLE-003).
 * incrementNumber = Rit / SamplingInterval for a sampled Rit.
 */
export function evaluateSampling(rit: RitNumber, interval: SamplingInterval): SamplingEvaluation {
  if (!isSampleRequired(rit, interval)) {
    return { sampleRequired: false }
  }
  const incrementNumber = (Number(rit) / Number(interval)) as SampleIncrementNumber
  return { sampleRequired: true, incrementNumber }
}
