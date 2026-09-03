import type { SupportedLanguage } from '@/i18n'

const DISPLAY_LOCALES: Readonly<Record<SupportedLanguage, string>> = {
  id: 'id-ID',
  en: 'en-US',
}

/**
 * Formats a `YYYY-MM-DD` ShiftDate for display without any timezone-driven
 * day shift: both the constructed Date and the formatter are pinned to
 * UTC, so the calendar day shown always matches the stored value exactly
 * regardless of the viewer's local timezone (TECH_STACK.md ADR-026).
 */
export function formatShiftDateForDisplay(shiftDate: string, language: SupportedLanguage): string {
  const [year, month, day] = shiftDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language], { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}
