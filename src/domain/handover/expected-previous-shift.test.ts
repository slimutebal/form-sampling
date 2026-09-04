import { describe, expect, it } from 'vitest'
import { parseShiftCode } from '../common/codes'
import { parseShiftDate } from '../common/shift-date'
import { checkPreviousShiftRelationship, type ExpectedPreviousShift } from './expected-previous-shift'
import { parseHandoverShiftInfo } from './handover-shift-info'

function mustShiftInfo(overrides: Partial<{ Date: string; Shift: string }> = {}) {
  const result = parseHandoverShiftInfo({
    Shift_ID: 'S1',
    Date: overrides.Date ?? '2026-09-03',
    Shift: overrides.Shift ?? 'D',
    Sector: 'BR1',
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function mustExpected(date: string, shiftCode: string): ExpectedPreviousShift {
  const dateResult = parseShiftDate(date)
  const shiftCodeResult = parseShiftCode(shiftCode)
  if (!dateResult.ok || !shiftCodeResult.ok) throw new Error('invalid test fixture')
  return { date: dateResult.value, shiftCode: shiftCodeResult.value }
}

describe('checkPreviousShiftRelationship', () => {
  it('matches when both date and shift equal the expectation', () => {
    const shiftInfo = mustShiftInfo()
    const check = checkPreviousShiftRelationship(shiftInfo, mustExpected('2026-09-03', 'D'))
    expect(check).toEqual({ dateMatches: true, shiftMatches: true, matches: true })
  })

  it('flags a wrong previous Date', () => {
    const shiftInfo = mustShiftInfo({ Date: '2026-09-01' })
    const check = checkPreviousShiftRelationship(shiftInfo, mustExpected('2026-09-03', 'D'))
    expect(check.dateMatches).toBe(false)
    expect(check.shiftMatches).toBe(true)
    expect(check.matches).toBe(false)
  })

  it('flags a wrong previous Shift', () => {
    const shiftInfo = mustShiftInfo({ Shift: 'N' })
    const check = checkPreviousShiftRelationship(shiftInfo, mustExpected('2026-09-03', 'D'))
    expect(check.dateMatches).toBe(true)
    expect(check.shiftMatches).toBe(false)
    expect(check.matches).toBe(false)
  })
})
