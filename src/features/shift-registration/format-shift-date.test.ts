import { describe, expect, it } from 'vitest'
import { formatShiftDateForDisplay } from './format-shift-date'

describe('formatShiftDateForDisplay', () => {
  it('formats date-only ShiftDates as dd-Mmm-yyyy without a timezone shift', () => {
    expect(formatShiftDateForDisplay('2026-10-06')).toBe('06-Oct-2026')
    expect(formatShiftDateForDisplay('2026-01-01')).toBe('01-Jan-2026')
    expect(formatShiftDateForDisplay('2026-09-04')).toBe('04-Sept-2026')
  })

  it('does not coerce malformed or impossible calendar dates', () => {
    expect(formatShiftDateForDisplay('2026-02-30')).toBe('2026-02-30')
    expect(formatShiftDateForDisplay('06-10-2026')).toBe('06-10-2026')
  })
})
