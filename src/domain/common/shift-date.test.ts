import { describe, expect, it } from 'vitest'
import { parseShiftDate } from './shift-date'

describe('parseShiftDate', () => {
  it.each(['2026-09-04', '2024-02-29'])('accepts valid calendar date %s', (value) => {
    expect(parseShiftDate(value).ok).toBe(true)
  })

  it.each(['2026-02-30', '2026-13-01', '04/09/2026', ''])('rejects invalid value %j', (value) => {
    expect(parseShiftDate(value).ok).toBe(false)
  })

  it('rejects February 29th on a non-leap year', () => {
    expect(parseShiftDate('2026-02-29').ok).toBe(false)
  })

  it('rejects a malformed separator or partial date', () => {
    expect(parseShiftDate('2026-9-4').ok).toBe(false)
    expect(parseShiftDate('2026-09').ok).toBe(false)
  })
})
