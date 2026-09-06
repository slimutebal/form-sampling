import { describe, expect, it } from 'vitest'
import { parseBatchSize } from '../master/sampling-config'
import {
  createBatchContinuationSeed,
  nextBatchPosition,
  nextNewBatchCandidate,
  planContinuations,
  remainingPositionsForSeed,
  remainingPositionsFromStart,
  type BatchContinuationSeed,
} from './batch-engine'
import { parseBatchNumber } from './batch-number'
import { createBatchPosition } from './batch-position'
import { parseRitNumber } from './rit-number'
import type { BatchSize } from '../master/sampling-config'
import type { BatchNumber } from './batch-number'
import type { BatchPosition } from './batch-position'
import type { RitNumber } from './rit-number'

function batchNumber(value: number): BatchNumber {
  const parsed = parseBatchNumber(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function ritNumber(value: number): RitNumber {
  const parsed = parseRitNumber(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function batchSize(value: number): BatchSize {
  const parsed = parseBatchSize(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function position(batch: number, rit: number): BatchPosition {
  return createBatchPosition(batchNumber(batch), ritNumber(rit))
}

function seed(batch: number, lastRit: number): BatchContinuationSeed {
  return createBatchContinuationSeed(batchNumber(batch), ritNumber(lastRit))
}

function asPairs(positions: readonly BatchPosition[]): Array<[number, number]> {
  return positions.map((p) => [Number(p.batchNumber), Number(p.ritNumber)])
}

describe('nextBatchPosition', () => {
  describe('SAP rollover (BatchSize 20)', () => {
    const size = batchSize(20)

    it('24/10 -> 24/11', () => {
      const result = nextBatchPosition(position(24, 10), size)
      expect(result.ok).toBe(true)
      if (result.ok) expect(asPairs([result.value])).toEqual([[24, 11]])
    })

    it('24/19 -> 24/20', () => {
      const result = nextBatchPosition(position(24, 19), size)
      expect(result.ok).toBe(true)
      if (result.ok) expect(asPairs([result.value])).toEqual([[24, 20]])
    })

    it('24/20 -> 25/01 (rollover)', () => {
      const result = nextBatchPosition(position(24, 20), size)
      expect(result.ok).toBe(true)
      if (result.ok) expect(asPairs([result.value])).toEqual([[25, 1]])
    })
  })

  describe('LIM rollover (BatchSize 100)', () => {
    const size = batchSize(100)

    it('40/99 -> 40/100', () => {
      const result = nextBatchPosition(position(40, 99), size)
      expect(result.ok).toBe(true)
      if (result.ok) expect(asPairs([result.value])).toEqual([[40, 100]])
    })

    it('40/100 -> 41/01 (rollover)', () => {
      const result = nextBatchPosition(position(40, 100), size)
      expect(result.ok).toBe(true)
      if (result.ok) expect(asPairs([result.value])).toEqual([[41, 1]])
    })
  })

  it('returns an explicit error when rit exceeds batch size, without normalizing input', () => {
    const result = nextBatchPosition(position(24, 21), batchSize(20))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
    }
  })
})

describe('remainingPositionsForSeed', () => {
  const size = batchSize(20)

  it('seed 24/10 -> remaining 24/11..24/20', () => {
    const result = remainingPositionsForSeed(seed(24, 10), size)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(asPairs(result.value)).toEqual([
        [24, 11],
        [24, 12],
        [24, 13],
        [24, 14],
        [24, 15],
        [24, 16],
        [24, 17],
        [24, 18],
        [24, 19],
        [24, 20],
      ])
    }
  })

  it('no remaining rit positions when lastRit equals batch size (not labeled "complete")', () => {
    const result = remainingPositionsForSeed(seed(24, 20), size)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual([])
    }
  })

  it('returns an explicit error when lastRit exceeds batch size', () => {
    const result = remainingPositionsForSeed(seed(24, 21), size)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
    }
  })
})

describe('remainingPositionsFromStart', () => {
  const size = batchSize(20)

  it('start 1/1 -> 1/1..1/20 (default fresh-pile start position)', () => {
    const result = remainingPositionsFromStart(position(1, 1), size)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(asPairs(result.value)[0]).toEqual([1, 1])
    expect(result.value).toHaveLength(20)
  })

  it('start 25/11 -> 25/11..25/20 (supervisor override)', () => {
    const result = remainingPositionsFromStart(position(25, 11), size)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(asPairs(result.value)).toEqual([
      [25, 11],
      [25, 12],
      [25, 13],
      [25, 14],
      [25, 15],
      [25, 16],
      [25, 17],
      [25, 18],
      [25, 19],
      [25, 20],
    ])
  })

  it('returns an explicit error when the start rit exceeds batch size', () => {
    const result = remainingPositionsFromStart(position(25, 21), size)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
    }
  })
})

describe('planContinuations — multiple pending batches (BR-PEND-003/004)', () => {
  const size = batchSize(20)

  it('produces deterministic numeric ordering from unsorted seeds', () => {
    const seeds = [seed(32, 14), seed(24, 10), seed(31, 18), seed(25, 3)]
    const originalOrder = seeds.map((s) => Number(s.batchNumber))

    const result = planContinuations(seeds, size)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(asPairs(result.value)).toEqual([
        [24, 11],
        [24, 12],
        [24, 13],
        [24, 14],
        [24, 15],
        [24, 16],
        [24, 17],
        [24, 18],
        [24, 19],
        [24, 20],
        [25, 4],
        [25, 5],
        [25, 6],
        [25, 7],
        [25, 8],
        [25, 9],
        [25, 10],
        [25, 11],
        [25, 12],
        [25, 13],
        [25, 14],
        [25, 15],
        [25, 16],
        [25, 17],
        [25, 18],
        [25, 19],
        [25, 20],
        [31, 19],
        [31, 20],
        [32, 15],
        [32, 16],
        [32, 17],
        [32, 18],
        [32, 19],
        [32, 20],
      ])
    }

    // Input array order must remain unchanged after planning.
    expect(seeds.map((s) => Number(s.batchNumber))).toEqual(originalOrder)
  })

  it('candidate new batch after multiple pending is highest pending + 1', () => {
    const seeds = [seed(32, 14), seed(24, 10), seed(31, 18), seed(25, 3)]
    const candidate = nextNewBatchCandidate(seeds)
    expect(candidate).toBeDefined()
    expect(Number(candidate)).toBe(33)
  })

  it('does not synthesize missing batch numbers for gapped batches', () => {
    const seeds = [seed(25, 19), seed(31, 19)]

    const result = planContinuations(seeds, size)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(asPairs(result.value)).toEqual([
        [25, 20],
        [31, 20],
      ])
    }

    const candidate = nextNewBatchCandidate(seeds)
    expect(Number(candidate)).toBe(32)
  })

  it('returns undefined for an empty pending seed list instead of inventing Batch 1', () => {
    const candidate = nextNewBatchCandidate([])
    expect(candidate).toBeUndefined()
  })

  it('rejects duplicate continuation seeds for the same batch number with different lastRit', () => {
    const seeds = [seed(24, 10), seed(24, 15)]
    const result = planContinuations(seeds, size)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('DUPLICATE_CONTINUATION_BATCH')
    }
  })

  it('rejects duplicate continuation seeds for the same batch number even with identical lastRit', () => {
    const seeds = [seed(24, 10), seed(24, 10)]
    const result = planContinuations(seeds, size)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('DUPLICATE_CONTINUATION_BATCH')
    }
  })

  it('does not mutate the caller-owned seed array', () => {
    const seeds = [seed(32, 14), seed(24, 10), seed(31, 18), seed(25, 3)]
    const snapshot = [...seeds]

    planContinuations(seeds, size)

    expect(seeds).toEqual(snapshot)
  })
})
