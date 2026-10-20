/**
 * Formats a `YYYY-MM-DD` ShiftDate as `dd-Mmm-yyyy` without a timezone-driven
 * day shift. The date-only string is parsed by its calendar components (not
 * by `new Date(shiftDate)`), then formatted in UTC so it stays the same on
 * every device timezone.
 */
export function formatShiftDateForDisplay(shiftDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shiftDate)
  if (!match) return shiftDate
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return shiftDate
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(date)
  return `${dayText}-${monthName}-${yearText}`
}
