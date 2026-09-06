import { describe, expect, it } from 'vitest'
import { deriveExpectedPreviousShift } from './derive-expected-previous-shift'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import { parseShiftId } from '@/domain/common/identifiers'
import { createShift, type Shift } from '@/domain/shift/shift'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildShift(date: string, shiftCode: string): Shift {
  return createShift({
    id: must(parseShiftId('shift-1')),
    date: must(parseShiftDate(date)),
    shiftCode: must(parseShiftCode(shiftCode)),
    sectorCode: must(parseSectorCode('BR1')),
    samplingHouseCode: must(parseSamplingHouseCode('SH_01')),
    status: 'NEW',
  })
}

describe('deriveExpectedPreviousShift', () => {
  it('A. an NS shift expects the same calendar day DS as its previous shift', () => {
    const result = deriveExpectedPreviousShift(buildShift('2026-09-04', 'NS'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.date).toBe('2026-09-04')
    expect(result.value.shiftCode).toBe('DS')
  })

  it('B. a DS shift expects the prior calendar day NS as its previous shift', () => {
    const result = deriveExpectedPreviousShift(buildShift('2026-09-04', 'DS'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.date).toBe('2026-09-03')
    expect(result.value.shiftCode).toBe('NS')
  })

  it('C. a DS shift on the first day of a month rolls back to the last day of the previous month', () => {
    const result = deriveExpectedPreviousShift(buildShift('2026-03-01', 'DS'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.date).toBe('2026-02-28')
    expect(result.value.shiftCode).toBe('NS')
  })

  it('D. a DS shift on Jan 1 rolls back across a year boundary', () => {
    const result = deriveExpectedPreviousShift(buildShift('2026-01-01', 'DS'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.date).toBe('2025-12-31')
  })

  it('E. an unsupported shift code (outside the closed DS/NS set) fails explicitly rather than guessing', () => {
    const result = deriveExpectedPreviousShift(buildShift('2026-09-04', 'D'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNSUPPORTED_SHIFT_CODE_FOR_PREVIOUS_SHIFT_DERIVATION')
  })
})
