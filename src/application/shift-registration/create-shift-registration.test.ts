import { describe, expect, it } from 'vitest'
import { createShiftRegistration, type ShiftRegistrationInput } from './create-shift-registration'

const VALID_INPUT: ShiftRegistrationInput = {
  shiftId: 'fixed-shift-id-001',
  shiftDate: '2026-09-04',
  shiftCode: 'S1',
  sectorCode: 'SEC',
  samplingHouseCode: 'HOUSE',
}

describe('createShiftRegistration', () => {
  it('A. builds a valid Shift in status NEW with every field preserved', () => {
    const result = createShiftRegistration(VALID_INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('fixed-shift-id-001')
    expect(result.value.date).toBe('2026-09-04')
    expect(result.value.shiftCode).toBe('S1')
    expect(result.value.sectorCode).toBe('SEC')
    expect(result.value.samplingHouseCode).toBe('HOUSE')
    expect(result.value.status).toBe('NEW')
  })

  it('B. trims surrounding whitespace on code fields, matching existing parser behavior', () => {
    const result = createShiftRegistration({
      ...VALID_INPUT,
      shiftCode: '  S1  ',
      sectorCode: '  SEC  ',
      samplingHouseCode: '  HOUSE  ',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftCode).toBe('S1')
    expect(result.value.sectorCode).toBe('SEC')
    expect(result.value.samplingHouseCode).toBe('HOUSE')
  })

  it('C. rejects an invalid shift date', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, shiftDate: '2026-13-04' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SHIFT_DATE_MONTH')
  })

  it('D. rejects a blank shift code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, shiftCode: '   ' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SHIFT_CODE')
  })

  it('E. rejects a blank sector code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, sectorCode: '' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SECTOR_CODE')
  })

  it('F. rejects a blank sampling house code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, samplingHouseCode: '' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SAMPLING_HOUSE_CODE')
  })
})
