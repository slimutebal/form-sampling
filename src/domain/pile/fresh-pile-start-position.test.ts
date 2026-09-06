import { describe, expect, it } from 'vitest'
import {
  createDefaultFreshPileStartPosition,
  parseFreshPileStartPosition,
} from '@/domain/pile/fresh-pile-start-position'

describe('createDefaultFreshPileStartPosition', () => {
  it('defaults to Batch 001 / Rit 001', () => {
    const position = createDefaultFreshPileStartPosition()
    expect(Number(position.batchNumber)).toBe(1)
    expect(Number(position.ritNumber)).toBe(1)
  })
})

describe('parseFreshPileStartPosition', () => {
  it('accepts a supervisor override, e.g. Batch 025 / Rit 001', () => {
    const result = parseFreshPileStartPosition(25, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.batchNumber)).toBe(25)
    expect(Number(result.value.ritNumber)).toBe(1)
  })

  it('accepts an override of both Batch and Rit, e.g. 025 / 011', () => {
    const result = parseFreshPileStartPosition(25, 11)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.batchNumber)).toBe(25)
    expect(Number(result.value.ritNumber)).toBe(11)
  })

  it('rejects a non-positive Batch number', () => {
    const result = parseFreshPileStartPosition(0, 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_BATCH_NUMBER')
  })

  it('rejects a non-positive Rit number', () => {
    const result = parseFreshPileStartPosition(1, 0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_RIT_NUMBER')
  })
})
