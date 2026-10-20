import { describe, expect, it } from 'vitest'
import { formatFleetFullCode, formatFleetShortLabel, validateFleetSequence } from './fleet-assignment-identity'
import { parseShiftDate } from '@/domain/common/shift-date'

function date(value: string) {
  const parsed = parseShiftDate(value)
  if (!parsed.ok) throw new Error('invalid test date')
  return parsed.value
}

describe('Fleet Assignment identity formatting', () => {
  it('uses the operational date, rather than the system date, for the permanent code', () => {
    expect(formatFleetFullCode({ operationalDate: date('2026-10-18'), shiftCode: 'D', sectorCode: 'BR1', sequence: 1 })).toBe('261018D-BR1-F01')
  })

  it('keeps the compact SETUP label separate from the permanent code', () => {
    expect(formatFleetShortLabel(1)).toBe('Fleet_01')
    expect(formatFleetShortLabel(123)).toBe('Fleet_123')
  })

  it('finds the smallest unused sequence and flags an intentional gap', () => {
    expect(validateFleetSequence(3, [1, 4])).toMatchObject({ valid: true, duplicate: false, requiresSkipConfirmation: true, smallestUnused: 2 })
    expect(validateFleetSequence(4, [1, 4])).toMatchObject({ valid: true, duplicate: true })
  })
})
