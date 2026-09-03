import { describe, expect, it } from 'vitest'
import { validateShiftRegistrationForm } from './validate-shift-registration-form'
import type { ShiftRegistrationFormValues } from './shift-registration-form-values'

const VALID_VALUES: ShiftRegistrationFormValues = {
  shiftDate: '2026-09-04',
  shiftCode: 'S1',
  sectorCode: 'SEC',
  samplingHouseCode: 'HOUSE',
}

describe('validateShiftRegistrationForm', () => {
  it('B. reports all four required field errors when every field is blank', () => {
    const result = validateShiftRegistrationForm({
      shiftDate: '',
      shiftCode: '',
      sectorCode: '',
      samplingHouseCode: '',
    })

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBeDefined()
    expect(result.fieldErrors.shiftCode).toBeDefined()
    expect(result.fieldErrors.sectorCode).toBeDefined()
    expect(result.fieldErrors.samplingHouseCode).toBeDefined()
  })

  it('C. an invalid date maps only to the shiftDate field, leaving other fields valid', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, shiftDate: '2026-13-04' })

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBe('INVALID_SHIFT_DATE_MONTH')
    expect(result.fieldErrors.shiftCode).toBeUndefined()
    expect(result.fieldErrors.sectorCode).toBeUndefined()
    expect(result.fieldErrors.samplingHouseCode).toBeUndefined()
  })

  it('D. valid input produces parsed fields with every value preserved', () => {
    const result = validateShiftRegistrationForm(VALID_VALUES)

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.fields.shiftDate).toBe('2026-09-04')
    expect(result.fields.shiftCode).toBe('S1')
    expect(result.fields.sectorCode).toBe('SEC')
    expect(result.fields.samplingHouseCode).toBe('HOUSE')
  })

  it('E. trims surrounding whitespace on code fields, matching existing parser behavior', () => {
    const result = validateShiftRegistrationForm({
      ...VALID_VALUES,
      shiftCode: '  S1  ',
      sectorCode: '  SEC  ',
      samplingHouseCode: '  HOUSE  ',
    })

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.fields.shiftCode).toBe('S1')
    expect(result.fields.sectorCode).toBe('SEC')
    expect(result.fields.samplingHouseCode).toBe('HOUSE')
  })

  it('an empty (not just invalid) date reports the friendlier required code', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, shiftDate: '' })

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBe('REQUIRED_SHIFT_DATE')
  })
})
