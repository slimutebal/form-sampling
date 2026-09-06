import { describe, expect, it } from 'vitest'
import { parseRitNumber } from '../batch/rit-number'
import { parseBatchSize, parseSamplingInterval } from '../master/sampling-config'
import { evaluateSampling, isSampleRequired, maxSampleIncrementsForBatch } from './sampling-engine'
import type { RitNumber } from '../batch/rit-number'
import type { BatchSize, SamplingInterval } from '../master/sampling-config'

function rit(value: number): RitNumber {
  const parsed = parseRitNumber(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function interval(value: number): SamplingInterval {
  const parsed = parseSamplingInterval(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function batchSize(value: number): BatchSize {
  const parsed = parseBatchSize(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

describe('isSampleRequired (BR-SAMPLE-001)', () => {
  describe('SAP interval 2', () => {
    const sap = interval(2)

    it.each([
      [1, false],
      [2, true],
      [3, false],
      [4, true],
      [20, true],
    ])('rit %d -> %s', (ritValue, expected) => {
      expect(isSampleRequired(rit(ritValue), sap)).toBe(expected)
    })
  })

  describe('LIM interval 5', () => {
    const lim = interval(5)

    it.each([
      [1, false],
      [5, true],
      [10, true],
      [99, false],
      [100, true],
    ])('rit %d -> %s', (ritValue, expected) => {
      expect(isSampleRequired(rit(ritValue), lim)).toBe(expected)
    })
  })

  describe('future config interval 3 (proves no SAP/LIM hard-coding)', () => {
    const future = interval(3)

    it.each([
      [3, true],
      [6, true],
      [7, false],
    ])('rit %d -> %s', (ritValue, expected) => {
      expect(isSampleRequired(rit(ritValue), future)).toBe(expected)
    })
  })

  it('interval 1 requires sampling for every positive rit', () => {
    const everyRit = interval(1)
    for (const value of [1, 2, 3, 50]) {
      expect(isSampleRequired(rit(value), everyRit)).toBe(true)
    }
  })
})

describe('evaluateSampling', () => {
  describe('SAP interval 2', () => {
    const sap = interval(2)

    it('produces no increment for a non-sampled rit', () => {
      const evaluation = evaluateSampling(rit(1), sap)
      expect(evaluation.sampleRequired).toBe(false)
      expect('incrementNumber' in evaluation).toBe(false)
    })

    it.each([
      [2, 1],
      [4, 2],
      [20, 10],
    ])('rit %d -> sample required, increment %d', (ritValue, expectedIncrement) => {
      const evaluation = evaluateSampling(rit(ritValue), sap)
      expect(evaluation.sampleRequired).toBe(true)
      if (evaluation.sampleRequired) {
        expect(Number(evaluation.incrementNumber)).toBe(expectedIncrement)
      }
    })
  })

  describe('LIM interval 5', () => {
    const lim = interval(5)

    it.each([
      [5, 1],
      [10, 2],
      [100, 20],
    ])('rit %d -> sample required, increment %d', (ritValue, expectedIncrement) => {
      const evaluation = evaluateSampling(rit(ritValue), lim)
      expect(evaluation.sampleRequired).toBe(true)
      if (evaluation.sampleRequired) {
        expect(Number(evaluation.incrementNumber)).toBe(expectedIncrement)
      }
    })

    it('rit 99 -> no sample', () => {
      const evaluation = evaluateSampling(rit(99), lim)
      expect(evaluation.sampleRequired).toBe(false)
    })
  })

  describe('future config interval 3', () => {
    const future = interval(3)

    it('rit 3 -> sample increment 1', () => {
      const evaluation = evaluateSampling(rit(3), future)
      expect(evaluation.sampleRequired).toBe(true)
      if (evaluation.sampleRequired) {
        expect(Number(evaluation.incrementNumber)).toBe(1)
      }
    })

    it('rit 6 -> sample increment 2', () => {
      const evaluation = evaluateSampling(rit(6), future)
      expect(evaluation.sampleRequired).toBe(true)
      if (evaluation.sampleRequired) {
        expect(Number(evaluation.incrementNumber)).toBe(2)
      }
    })

    it('rit 7 -> no sample', () => {
      const evaluation = evaluateSampling(rit(7), future)
      expect(evaluation.sampleRequired).toBe(false)
    })
  })
})

describe('maxSampleIncrementsForBatch', () => {
  it('SAP config (batch 20 / interval 2) -> 10', () => {
    expect(maxSampleIncrementsForBatch(batchSize(20), interval(2))).toBe(10)
  })

  it('LIM config (batch 100 / interval 5) -> 20', () => {
    expect(maxSampleIncrementsForBatch(batchSize(100), interval(5))).toBe(20)
  })

  it('rounds down when the batch size does not divide evenly', () => {
    expect(maxSampleIncrementsForBatch(batchSize(10), interval(3))).toBe(3)
  })
})
