import { describe, expect, it } from 'vitest'
import { createBatchContinuationSeed, remainingPositionsForSeed } from '../batch/batch-engine'
import { parseBatchNumber } from '../batch/batch-number'
import { parseRitNumber } from '../batch/rit-number'
import { parseBatchSize, parseSamplingInterval } from '../master/sampling-config'
import { evaluateSampling } from './sampling-engine'

/**
 * Demonstrates that batch positions produced by the batch engine can be
 * evaluated by the sampling engine purely through function composition —
 * neither module imports the other, and neither depends on UI or
 * persistence.
 */
describe('sampling + batch composition (SAP)', () => {
  it('evaluates sampling for the remaining positions of a continuation seed', () => {
    const batchSize = parseBatchSize(20)
    const interval = parseSamplingInterval(2)
    const batchNumber = parseBatchNumber(24)
    const lastRit = parseRitNumber(18)
    if (!batchSize.ok || !interval.ok || !batchNumber.ok || !lastRit.ok) {
      throw new Error('invalid test fixture')
    }

    const seed = createBatchContinuationSeed(batchNumber.value, lastRit.value)
    const remaining = remainingPositionsForSeed(seed, batchSize.value)
    expect(remaining.ok).toBe(true)
    if (!remaining.ok) return

    expect(remaining.value.map((p) => Number(p.ritNumber))).toEqual([19, 20])

    const evaluations = remaining.value.map((p) => evaluateSampling(p.ritNumber, interval.value))

    expect(evaluations[0].sampleRequired).toBe(false)

    expect(evaluations[1].sampleRequired).toBe(true)
    if (evaluations[1].sampleRequired) {
      expect(Number(evaluations[1].incrementNumber)).toBe(10)
    }
  })
})
