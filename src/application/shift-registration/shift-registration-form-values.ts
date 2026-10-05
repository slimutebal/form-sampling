export interface ShiftRegistrationFormValues {
  readonly shiftDate: string
  readonly shiftCode: string
  readonly sectorCode: string
  readonly samplingHouseCode: string
}

export const EMPTY_SHIFT_REGISTRATION_FORM_VALUES: ShiftRegistrationFormValues = {
  shiftDate: '',
  shiftCode: '',
  sectorCode: '',
  samplingHouseCode: '',
}

/**
 * Builds the initial values for one new Shift Registration using the
 * device's local calendar and clock. Call this once when the new form is
 * created; subsequent edits stay in the form state owned by the caller.
 */
export function createDefaultShiftRegistrationFormValues(now: Date): ShiftRegistrationFormValues {
  const shiftDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join(
    '-',
  )
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
  const shiftCode = minutesSinceMidnight >= 6 * 60 + 30 && minutesSinceMidnight < 18 * 60 + 30 ? 'D' : 'N'

  return {
    ...EMPTY_SHIFT_REGISTRATION_FORM_VALUES,
    shiftDate,
    shiftCode,
  }
}
