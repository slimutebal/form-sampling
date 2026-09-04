import type { BatchNumber } from '../batch/batch-number'
import type { RitNumber } from '../batch/rit-number'
import type { PileId, ShiftId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'

/**
 * The minimal shape needed to evaluate Sample Position overlap
 * (BR-SP-004). `SamplePosition` (`./sample-position`) structurally
 * satisfies this — kept as its own narrow interface (rather than
 * importing `SamplePosition` directly) so this module has no dependency
 * on sample-position.ts, and so a pre-save candidate can be checked
 * before a SamplePositionId even exists.
 */
export interface SampleOverlapCandidate {
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly batchNumber: BatchNumber
  readonly sampledRitNumbers: readonly RitNumber[]
}

/**
 * BR-SP-004: two Sample Positions overlap only when they share the same
 * Shift, the same Pile, and the same Batch, and their generated sampled
 * Rit sets intersect. A shared numeric range with a different Pile or
 * Batch is explicitly valid — this function never falls back to raw
 * numeric range overlap. Never mutates `existing`.
 */
export function validateNoSampleOverlap<T extends SampleOverlapCandidate>(
  candidate: T,
  existing: readonly SampleOverlapCandidate[],
): Result<T, DomainError> {
  const candidateRits = new Set(candidate.sampledRitNumbers.map(Number))

  const overlapping = existing.find((position) => {
    if (position.shiftId !== candidate.shiftId) return false
    if (position.pileId !== candidate.pileId) return false
    if (position.batchNumber !== candidate.batchNumber) return false
    return position.sampledRitNumbers.some((rit) => candidateRits.has(Number(rit)))
  })

  if (overlapping) {
    return err({
      code: 'SAMPLE_POSITION_OVERLAP',
      message: `Sample range overlaps an existing sample position for Pile ${candidate.pileId} Batch ${Number(candidate.batchNumber)}`,
    })
  }

  return ok(candidate)
}
