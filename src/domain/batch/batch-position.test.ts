import { describe, expect, it } from 'vitest'
import { parseBatchSize } from '../master/sampling-config'
import { parseBatchNumber } from './batch-number'
import { createBatchPosition, createInitialBatchPosition, validateBatchPosition } from './batch-position'
import { parseRitNumber } from './rit-number'
import type { BatchSize } from '../master/sampling-config'
import type { BatchNumber } from './batch-number'
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

describe('BatchPosition', () => {
  it('keeps batch and rit as separate numeric values', () => {
    const position = createBatchPosition(batchNumber(24), ritNumber(10))
    expect(Number(position.batchNumber)).toBe(24)
    expect(Number(position.ritNumber)).toBe(10)
  })

  it('createInitialBatchPosition builds Rit 1 from a caller-supplied BatchNumber', () => {
    const position = createInitialBatchPosition(batchNumber(33))
    expect(Number(position.batchNumber)).toBe(33)
    expect(Number(position.ritNumber)).toBe(1)
  })
})

describe('validateBatchPosition (BatchSize 20)', () => {
  const size = batchSize(20)

  it('accepts a rit within the batch size', () => {
    const result = validateBatchPosition(createBatchPosition(batchNumber(24), ritNumber(10)), size)
    expect(result.ok).toBe(true)
  })

  it('accepts a rit exactly at the batch size', () => {
    const result = validateBatchPosition(createBatchPosition(batchNumber(24), ritNumber(20)), size)
    expect(result.ok).toBe(true)
  })

  it('rejects a rit that exceeds the batch size with an explicit error', () => {
    const result = validateBatchPosition(createBatchPosition(batchNumber(24), ritNumber(21)), size)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
    }
  })
})
