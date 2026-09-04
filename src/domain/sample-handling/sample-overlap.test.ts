import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '../batch/batch-number'
import { parseRitNumber } from '../batch/rit-number'
import { parsePileId, parseShiftId } from '../common/identifiers'
import { validateNoSampleOverlap, type SampleOverlapCandidate } from './sample-overlap'

function shiftId(value: string) {
  const result = parseShiftId(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}
function pileId(value: string) {
  const result = parsePileId(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}
function batchNumber(value: number) {
  const result = parseBatchNumber(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}
function rits(values: readonly number[]) {
  return values.map((value) => {
    const result = parseRitNumber(value)
    if (!result.ok) throw new Error('invalid test fixture')
    return result.value
  })
}

function candidate(params: {
  shift?: string
  pile?: string
  batch?: number
  sampled: readonly number[]
}): SampleOverlapCandidate {
  return {
    shiftId: shiftId(params.shift ?? 'SHIFT-1'),
    pileId: pileId(params.pile ?? 'PILE-1'),
    batchNumber: batchNumber(params.batch ?? 24),
    sampledRitNumbers: rits(params.sampled),
  }
}

describe('validateNoSampleOverlap', () => {
  it('H. same Pile/Batch with intersecting sampled Rits is rejected as overlap', () => {
    const existing = candidate({ sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ sampled: [8, 10, 12, 14, 16, 18, 20] })
    const result = validateNoSampleOverlap(incoming, [existing])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_POSITION_OVERLAP')
  })

  it('I. same Pile/Batch with disjoint sampled Rits is valid', () => {
    const existing = candidate({ sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ sampled: [12, 14, 16, 18, 20] })
    const result = validateNoSampleOverlap(incoming, [existing])
    expect(result.ok).toBe(true)
  })

  it('J. the same numeric range on a different Batch is valid', () => {
    const existing = candidate({ batch: 24, sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ batch: 25, sampled: [2, 4, 6, 8, 10] })
    const result = validateNoSampleOverlap(incoming, [existing])
    expect(result.ok).toBe(true)
  })

  it('K. the same numeric range on a different Pile is valid', () => {
    const existing = candidate({ pile: 'PILE-1', sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ pile: 'PILE-2', sampled: [2, 4, 6, 8, 10] })
    const result = validateNoSampleOverlap(incoming, [existing])
    expect(result.ok).toBe(true)
  })

  it('the same numeric range on a different Shift is valid', () => {
    const existing = candidate({ shift: 'SHIFT-1', sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ shift: 'SHIFT-2', sampled: [2, 4, 6, 8, 10] })
    const result = validateNoSampleOverlap(incoming, [existing])
    expect(result.ok).toBe(true)
  })

  it('does not mutate the existing collection', () => {
    const existing = candidate({ sampled: [2, 4, 6, 8, 10] })
    const incoming = candidate({ sampled: [8, 10] })
    validateNoSampleOverlap(incoming, [existing])
    expect(existing.sampledRitNumbers.map(Number)).toEqual([2, 4, 6, 8, 10])
  })
})
