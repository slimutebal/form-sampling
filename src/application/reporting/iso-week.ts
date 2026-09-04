import type { ShiftDate } from '@/domain/common/shift-date'

/**
 * ISO 8601 week identity: the ISO week-numbering year (which can differ
 * from the calendar year at the very start/end of December/January) and
 * the ISO week number (1-53).
 */
export interface IsoWeek {
  readonly isoYear: number
  readonly isoWeekNumber: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Computes the ISO 8601 week-numbering year and week number for a
 * `ShiftDate` (`YYYY-MM-DD`). Deliberately timezone-safe: the date's
 * year/month/day components are parsed directly out of the string and
 * a UTC-anchored `Date` is built from them (`Date.UTC`), so this never
 * depends on the host's local timezone offset the way
 * `new Date(dateString)` or `Date.prototype.getDay()` would.
 *
 * Uses the standard "nearest Thursday" ISO week algorithm: a date
 * belongs to the same ISO week as the Thursday of its own Monday-Sunday
 * week, and that week's number is its Thursday's ordinal day of the
 * year divided by 7 (rounded up) — which is also why the ISO week
 *-numbering year can differ from the plain calendar year for a few
 * late-December/early-January dates (BUSINESS_RULES/ROADMAP Phase 14 —
 * "Do not use locale-dependent browser week calculation").
 */
export function isoWeekOf(date: ShiftDate): IsoWeek {
  const [year, month, day] = String(date).split('-').map(Number)

  // Shift to the Thursday of the same ISO (Monday-first) week.
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const isoWeekday = (utcDate.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  utcDate.setUTCDate(utcDate.getUTCDate() - isoWeekday + 3)

  const isoYear = utcDate.getUTCFullYear()
  const yearStartThursday = new Date(Date.UTC(isoYear, 0, 4))
  const yearStartIsoWeekday = (yearStartThursday.getUTCDay() + 6) % 7
  yearStartThursday.setUTCDate(yearStartThursday.getUTCDate() - yearStartIsoWeekday + 3)

  const isoWeekNumber = 1 + Math.round((utcDate.getTime() - yearStartThursday.getTime()) / (7 * MS_PER_DAY))

  return { isoYear, isoWeekNumber }
}
