import { describe, expect, it } from 'vitest'
import { parseShiftDate } from '@/domain/common/shift-date'
import { isoWeekOf } from './iso-week'

function date(value: string) {
  const parsed = parseShiftDate(value)
  if (!parsed.ok) throw new Error('bad fixture date')
  return parsed.value
}

describe('isoWeekOf', () => {
  it('computes an ordinary mid-year week (Friday 2026-09-04)', () => {
    expect(isoWeekOf(date('2026-09-04'))).toEqual({ isoYear: 2026, isoWeekNumber: 36 })
  })

  it('a January date can belong to the previous ISO year (2005-01-01 -> 2004-W53)', () => {
    expect(isoWeekOf(date('2005-01-01'))).toEqual({ isoYear: 2004, isoWeekNumber: 53 })
  })

  it('a January date can belong to the previous ISO year (2005-01-02 -> 2004-W53)', () => {
    expect(isoWeekOf(date('2005-01-02'))).toEqual({ isoYear: 2004, isoWeekNumber: 53 })
  })

  it('an ordinary year-end week (2005-12-31 -> 2005-W52)', () => {
    expect(isoWeekOf(date('2005-12-31'))).toEqual({ isoYear: 2005, isoWeekNumber: 52 })
  })

  it('a January 1st that starts ISO week 1 (2007-01-01, Monday -> 2007-W01)', () => {
    expect(isoWeekOf(date('2007-01-01'))).toEqual({ isoYear: 2007, isoWeekNumber: 1 })
  })

  it('a December date can belong to the next ISO year (2007-12-31, Monday -> 2008-W01)', () => {
    expect(isoWeekOf(date('2007-12-31'))).toEqual({ isoYear: 2008, isoWeekNumber: 1 })
  })

  it('the day before a December rollover stays in the old ISO year (2007-12-30 -> 2007-W52)', () => {
    expect(isoWeekOf(date('2007-12-30'))).toEqual({ isoYear: 2007, isoWeekNumber: 52 })
  })

  it('a December date can belong to the next ISO year (2008-12-29, Monday -> 2009-W01)', () => {
    expect(isoWeekOf(date('2008-12-29'))).toEqual({ isoYear: 2009, isoWeekNumber: 1 })
  })

  it('a year can have an ISO week 53 (2009-12-31 -> 2009-W53)', () => {
    expect(isoWeekOf(date('2009-12-31'))).toEqual({ isoYear: 2009, isoWeekNumber: 53 })
  })

  it('ISO week 53 can spill into the next calendar year (2010-01-03 -> 2009-W53)', () => {
    expect(isoWeekOf(date('2010-01-03'))).toEqual({ isoYear: 2009, isoWeekNumber: 53 })
  })

  it('the day after ISO week 53 starts the new ISO year (2010-01-04, Monday -> 2010-W01)', () => {
    expect(isoWeekOf(date('2010-01-04'))).toEqual({ isoYear: 2010, isoWeekNumber: 1 })
  })

  it('a leap-year February date (2024-02-29 -> 2024-W09)', () => {
    expect(isoWeekOf(date('2024-02-29'))).toEqual({ isoYear: 2024, isoWeekNumber: 9 })
  })
})
