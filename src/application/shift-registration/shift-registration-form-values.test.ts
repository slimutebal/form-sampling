import { describe, expect, it } from 'vitest'
import { createDefaultShiftRegistrationFormValues } from './shift-registration-form-values'

describe('createDefaultShiftRegistrationFormValues', () => {
  it.each([
    [6, 29, 'NS'],
    [6, 30, 'DS'],
    [18, 29, 'DS'],
    [18, 30, 'NS'],
  ] as const)('uses local %i:%i as %s', (hours, minutes, shiftCode) => {
    expect(createDefaultShiftRegistrationFormValues(new Date(2026, 8, 4, hours, minutes)).shiftCode).toBe(shiftCode)
  })

  it('formats the device local calendar date as YYYY-MM-DD', () => {
    expect(createDefaultShiftRegistrationFormValues(new Date(2026, 0, 9, 10, 0)).shiftDate).toBe('2026-01-09')
  })
})
