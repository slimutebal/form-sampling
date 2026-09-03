import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { BatchSize } from '../master/sampling-config'
import type { BatchNumber } from './batch-number'
import type { BatchPosition } from './batch-position'
import { createBatchPosition, validateBatchPosition } from './batch-position'
import type { RitNumber } from './rit-number'

/**
 * Deterministic progression from one BatchPosition to the next
 * (BR-BATCH-002, BR-BATCH-003). When the current Rit is below the
 * configured BatchSize, only the Rit advances. When it equals the
 * BatchSize, the batch rolls over: BatchNumber + 1, Rit 1. A current
 * Rit greater than BatchSize is an explicit domain error — invalid
 * input is never silently normalized.
 */
export function nextBatchPosition(current: BatchPosition, batchSize: BatchSize): Result<BatchPosition, DomainError> {
  const validated = validateBatchPosition(current, batchSize)
  if (!validated.ok) {
    return validated
  }

  const currentRit = Number(current.ritNumber)
  const size = Number(batchSize)

  if (currentRit === size) {
    const nextBatchNumber = (Number(current.batchNumber) + 1) as BatchNumber
    return ok(createBatchPosition(nextBatchNumber, 1 as RitNumber))
  }

  const nextRit = (currentRit + 1) as RitNumber
  return ok(createBatchPosition(current.batchNumber, nextRit))
}

/**
 * Status-neutral input to batch continuation (BR-PEND-002/003): a
 * BatchNumber and the last recorded RitNumber for it. Deliberately
 * excludes PendingStatus — the caller decides which pending batches
 * are eligible for continuation (e.g. filtering by CONTINUE) before
 * building seeds. Phase 4 does not interpret HOLD semantics.
 */
export interface BatchContinuationSeed {
  readonly batchNumber: BatchNumber
  readonly lastRit: RitNumber
}

export function createBatchContinuationSeed(batchNumber: BatchNumber, lastRit: RitNumber): BatchContinuationSeed {
  return { batchNumber, lastRit }
}

/**
 * The remaining configured Rit positions for one continuation seed
 * (BR-BATCH-002). An empty array means there are no remaining
 * configured Rit positions in that batch — this is deliberately not
 * labeled "complete"; the operational definition of Batch Complete is
 * NEEDS_CONFIRMATION (BUSINESS_RULES.md §26).
 */
export function remainingPositionsForSeed(
  seed: BatchContinuationSeed,
  batchSize: BatchSize,
): Result<BatchPosition[], DomainError> {
  const lastRit = Number(seed.lastRit)
  const size = Number(batchSize)

  if (lastRit > size) {
    return err({
      code: 'RIT_EXCEEDS_BATCH_SIZE',
      message: `Last rit ${lastRit} exceeds configured batch size ${size}`,
    })
  }

  const positions: BatchPosition[] = []
  for (let rit = lastRit + 1; rit <= size; rit++) {
    positions.push(createBatchPosition(seed.batchNumber, rit as RitNumber))
  }
  return ok(positions)
}

function findDuplicateBatchNumber(seeds: readonly BatchContinuationSeed[]): BatchNumber | undefined {
  const seen = new Set<number>()
  for (const seed of seeds) {
    const value = Number(seed.batchNumber)
    if (seen.has(value)) {
      return seed.batchNumber
    }
    seen.add(value)
  }
  return undefined
}

/**
 * Builds the deterministic, numerically-ordered continuation plan for
 * multiple pending batches on one pile (BR-PEND-003/004). Seeds are
 * sorted numerically by BatchNumber — never lexicographically by a
 * formatted string — and the input array is never mutated or reordered
 * in place. A plan may contain at most one seed per BatchNumber: any
 * repeated BatchNumber is ambiguous input and is rejected explicitly,
 * whether or not the repeated seeds agree on lastRit — never resolved
 * by first/last-wins.
 */
export function planContinuations(
  seeds: readonly BatchContinuationSeed[],
  batchSize: BatchSize,
): Result<BatchPosition[], DomainError> {
  const duplicate = findDuplicateBatchNumber(seeds)
  if (duplicate !== undefined) {
    return err({
      code: 'DUPLICATE_CONTINUATION_BATCH',
      message: `Batch number ${Number(duplicate)} appears more than once in continuation seeds`,
    })
  }

  const sortedSeeds = [...seeds].sort((a, b) => Number(a.batchNumber) - Number(b.batchNumber))

  const allPositions: BatchPosition[] = []
  for (const seed of sortedSeeds) {
    const positions = remainingPositionsForSeed(seed, batchSize)
    if (!positions.ok) {
      return positions
    }
    allPositions.push(...positions.value)
  }
  return ok(allPositions)
}

/**
 * The candidate BatchNumber for a new batch after all selected pending
 * continuation seeds are exhausted (BR-BATCH-004): highest pending
 * BatchNumber + 1. Gaps between pending batch numbers are not
 * synthesized into new batches — only the batch numbers explicitly
 * present are considered. Returns undefined for an empty seed list:
 * Phase 4 must not invent an initial BatchNumber when there is no
 * pending history.
 */
export function nextNewBatchCandidate(seeds: readonly BatchContinuationSeed[]): BatchNumber | undefined {
  if (seeds.length === 0) {
    return undefined
  }
  const highest = Math.max(...seeds.map((seed) => Number(seed.batchNumber)))
  return (highest + 1) as BatchNumber
}
