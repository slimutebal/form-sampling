import { describe, expect, it } from 'vitest'
import { parseHandoverShiftInfo } from './handover-shift-info'

describe('parseHandoverShiftInfo', () => {
  it('accepts a valid Shift_Info row', () => {
    const result = parseHandoverShiftInfo({
      Shift_ID: 'SHIFT-PREV-1',
      Date: '2026-09-03',
      Shift: 'D',
      Sector: 'BR1',
      Location: 'HOUSE-1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftId).toBe('SHIFT-PREV-1')
    expect(result.value.date).toBe('2026-09-03')
    expect(result.value.shiftCode).toBe('D')
    expect(result.value.sectorCode).toBe('BR1')
    expect(result.value.samplingHouseCode).toBe('HOUSE-1')
  })

  it('treats a missing Location as optional', () => {
    const result = parseHandoverShiftInfo({ Shift_ID: 'S1', Date: '2026-09-03', Shift: 'D', Sector: 'BR1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingHouseCode).toBeUndefined()
  })

  it('rejects a blank Shift_ID', () => {
    const result = parseHandoverShiftInfo({ Date: '2026-09-03', Shift: 'D', Sector: 'BR1' })
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid Date', () => {
    const result = parseHandoverShiftInfo({ Shift_ID: 'S1', Date: 'not-a-date', Shift: 'D', Sector: 'BR1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SHIFT_DATE_FORMAT')
  })

  it('rejects a missing Shift code', () => {
    const result = parseHandoverShiftInfo({ Shift_ID: 'S1', Date: '2026-09-03', Sector: 'BR1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SHIFT_CODE')
  })
})
