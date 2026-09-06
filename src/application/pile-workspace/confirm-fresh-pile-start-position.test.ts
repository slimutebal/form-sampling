import { describe, expect, it } from 'vitest'
import { confirmFreshPileStartPosition } from '@/application/pile-workspace/confirm-fresh-pile-start-position'

describe('confirmFreshPileStartPosition', () => {
  it('accepts the default 001/001 when no haulage has been recorded yet', () => {
    const result = confirmFreshPileStartPosition({ batchNumber: 1, ritNumber: 1, existingTransactionCount: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.batchNumber)).toBe(1)
    expect(Number(result.value.ritNumber)).toBe(1)
  })

  it('accepts a supervisor override before the first haulage', () => {
    const result = confirmFreshPileStartPosition({ batchNumber: 25, ritNumber: 11, existingTransactionCount: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.batchNumber)).toBe(25)
    expect(Number(result.value.ritNumber)).toBe(11)
  })

  it('rejects any change once the first haulage transaction has been saved', () => {
    const result = confirmFreshPileStartPosition({ batchNumber: 1, ritNumber: 1, existingTransactionCount: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRESH_PILE_START_POSITION_LOCKED')
  })

  it('rejects an invalid Batch/Rit even before any haulage exists', () => {
    const result = confirmFreshPileStartPosition({ batchNumber: 0, ritNumber: 1, existingTransactionCount: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_BATCH_NUMBER')
  })
})
