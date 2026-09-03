import { describe, expect, it } from 'vitest'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '../common/codes'
import { parseShiftId } from '../common/identifiers'
import { parseShiftDate } from '../common/shift-date'
import { createShift } from './shift'

describe('Shift', () => {
  it('assembles a minimal shift from validated value objects', () => {
    const id = parseShiftId('SHIFT-1')
    const date = parseShiftDate('2026-09-04')
    const shiftCode = parseShiftCode('D')
    const sectorCode = parseSectorCode('BR1')
    const samplingHouseCode = parseSamplingHouseCode('HOUSE-1')

    expect(id.ok && date.ok && shiftCode.ok && sectorCode.ok && samplingHouseCode.ok).toBe(true)
    if (!id.ok || !date.ok || !shiftCode.ok || !sectorCode.ok || !samplingHouseCode.ok) {
      return
    }

    const shift = createShift({
      id: id.value,
      date: date.value,
      shiftCode: shiftCode.value,
      sectorCode: sectorCode.value,
      samplingHouseCode: samplingHouseCode.value,
      status: 'NEW',
    })

    expect(shift.status).toBe('NEW')
    expect(shift.id).toBe(id.value)
    expect(shift.date).toBe(date.value)
  })
})
