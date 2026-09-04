import { describe, expect, it } from 'vitest'
import { parsePackingConfigValue, parseSamplingInterval } from '../master/sampling-config'
import { calculateTotalBag } from './total-bag'

function interval(value: number) {
  const result = parseSamplingInterval(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function packing(value: number) {
  const result = parsePackingConfigValue(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function totalBagOf(result: ReturnType<typeof calculateTotalBag>): number {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return Number(result.value)
}

describe('calculateTotalBag', () => {
  it('SAP: interval 2, packing 2, 5 sampled Rits -> Total Bag 5', () => {
    expect(totalBagOf(calculateTotalBag(5, interval(2), packing(2)))).toBe(5)
  })

  it('SAP: interval 2, packing 2, 10 sampled Rits (full batch) -> Total Bag 10', () => {
    expect(totalBagOf(calculateTotalBag(10, interval(2), packing(2)))).toBe(10)
  })

  it('LIM: interval 5, packing 10, 10 sampled Rits -> Total Bag 5', () => {
    expect(totalBagOf(calculateTotalBag(10, interval(5), packing(10)))).toBe(5)
  })

  it('LIM: interval 5, packing 10, 1 sampled Rit -> Total Bag 0.5 (fractional, not rounded)', () => {
    expect(totalBagOf(calculateTotalBag(1, interval(5), packing(10)))).toBe(0.5)
  })

  it('LIM: interval 5, packing 10, 20 sampled Rits (full batch) -> Total Bag 10', () => {
    expect(totalBagOf(calculateTotalBag(20, interval(5), packing(10)))).toBe(10)
  })

  it('rejects a zero sampledRitCount', () => {
    const result = calculateTotalBag(0, interval(2), packing(2))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLED_RIT_COUNT')
  })

  it('rejects a negative sampledRitCount', () => {
    const result = calculateTotalBag(-1, interval(2), packing(2))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLED_RIT_COUNT')
  })

  it('rejects a fractional sampledRitCount', () => {
    const result = calculateTotalBag(2.5, interval(2), packing(2))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLED_RIT_COUNT')
  })

  it('rejects a non-finite sampledRitCount', () => {
    const result = calculateTotalBag(Number.POSITIVE_INFINITY, interval(2), packing(2))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLED_RIT_COUNT')
  })

  it('rejects a NaN sampledRitCount', () => {
    const result = calculateTotalBag(Number.NaN, interval(2), packing(2))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLED_RIT_COUNT')
  })
})
