import type { Brand } from './brand'
import type { DomainError, Result } from './result'
import { err, ok } from './result'

export type ShiftDate = Brand<string, 'ShiftDate'>

const SHIFT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29
  }
  return DAYS_IN_MONTH[month - 1]
}

/**
 * Validates a date-only operational shift date in `YYYY-MM-DD` form.
 * Deliberately avoids `Date` objects (no timezone conversion, no
 * silent overflow of invalid days into the next month).
 */
export function parseShiftDate(value: string): Result<ShiftDate> {
  const match = SHIFT_DATE_PATTERN.exec(value)
  if (!match) {
    return err<DomainError>({
      code: 'INVALID_SHIFT_DATE_FORMAT',
      message: 'Shift date must use YYYY-MM-DD format',
    })
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (month < 1 || month > 12) {
    return err<DomainError>({
      code: 'INVALID_SHIFT_DATE_MONTH',
      message: `Month ${monthText} is not a valid calendar month`,
    })
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return err<DomainError>({
      code: 'INVALID_SHIFT_DATE_DAY',
      message: `Day ${dayText} is not valid for ${yearText}-${monthText}`,
    })
  }

  return ok(value as ShiftDate)
}

/**
 * The calendar day immediately before `date` (plain `YYYY-MM-DD` day
 * arithmetic, reusing the same leap-year/days-in-month rules as
 * `parseShiftDate`). Deliberately avoids `Date` objects for the same
 * reason `parseShiftDate` does — no timezone conversion, no silent
 * overflow. Pure calendar math only; carries no shift-sequencing
 * business meaning of its own (see `deriveExpectedPreviousShift`, which
 * is the one place that meaning is assigned).
 */
export function previousCalendarDate(date: ShiftDate): ShiftDate {
  const match = SHIFT_DATE_PATTERN.exec(date)
  if (!match) {
    throw new Error(`Invalid ShiftDate reached previousCalendarDate: ${date}`)
  }
  const [, yearText, monthText, dayText] = match
  let year = Number(yearText)
  let month = Number(monthText)
  let day = Number(dayText)

  day -= 1
  if (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day = daysInMonth(year, month)
  }

  const pad = (value: number, length: number) => String(value).padStart(length, '0')
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as ShiftDate
}
