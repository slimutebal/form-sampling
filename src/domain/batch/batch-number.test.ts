import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from './batch-number'

describe('parseBatchNumber', () => {
  it.each([1, 24, 33])('accepts positive integer %d', (value) => {
    expect(parseBatchNumber(value).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(parseBatchNumber(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(parseBatchNumber(-1).ok).toBe(false)
  })

  it('rejects decimal values', () => {
    expect(parseBatchNumber(1.5).ok).toBe(false)
  })

  it('rejects NaN', () => {
    expect(parseBatchNumber(Number.NaN).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(parseBatchNumber(Number.POSITIVE_INFINITY).ok).toBe(false)
    expect(parseBatchNumber(Number.NEGATIVE_INFINITY).ok).toBe(false)
  })
})
