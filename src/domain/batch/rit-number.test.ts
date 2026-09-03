import { describe, expect, it } from 'vitest'
import { parseRitNumber } from './rit-number'

describe('parseRitNumber', () => {
  it.each([1, 10, 100])('accepts positive integer %d', (value) => {
    expect(parseRitNumber(value).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(parseRitNumber(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(parseRitNumber(-1).ok).toBe(false)
  })

  it('rejects decimal values', () => {
    expect(parseRitNumber(2.5).ok).toBe(false)
  })

  it('rejects NaN', () => {
    expect(parseRitNumber(Number.NaN).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(parseRitNumber(Number.POSITIVE_INFINITY).ok).toBe(false)
  })

  it('does not reject values beyond any ore-specific batch size, since RitNumber is generic', () => {
    expect(parseRitNumber(21).ok).toBe(true)
    expect(parseRitNumber(101).ok).toBe(true)
  })
})
