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
