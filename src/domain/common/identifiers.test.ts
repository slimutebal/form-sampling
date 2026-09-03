import { describe, expect, it } from 'vitest'
import {
  parseEmployeeId,
  parseFleetId,
  parseFrontId,
  parseHaulageTransactionId,
  parsePileId,
  parseSampleHandlingId,
  parseSamplePositionId,
  parseShiftId,
  parseTruckId,
  type PileId,
} from './identifiers'

type IdParser = (value: string) => { readonly ok: boolean }

const parsers: ReadonlyArray<readonly [string, IdParser]> = [
  ['ShiftId', parseShiftId],
  ['PileId', parsePileId],
  ['TruckId', parseTruckId],
  ['FrontId', parseFrontId],
  ['FleetId', parseFleetId],
  ['EmployeeId', parseEmployeeId],
  ['HaulageTransactionId', parseHaulageTransactionId],
  ['SampleHandlingId', parseSampleHandlingId],
  ['SamplePositionId', parseSamplePositionId],
]

describe('domain identifiers', () => {
  it.each(parsers)('%s accepts a valid non-empty value', (_label, parse) => {
    expect(parse('ABC-001').ok).toBe(true)
  })

  it.each(parsers)('%s rejects a blank value', (_label, parse) => {
    expect(parse('').ok).toBe(false)
  })

  it.each(parsers)('%s rejects a whitespace-only value', (_label, parse) => {
    expect(parse('   ').ok).toBe(false)
  })

  it('keeps distinct branded id types incompatible at compile time', () => {
    const shiftId = parseShiftId('SHIFT-001')
    const pileId = parsePileId('PILE-001')
    expect(shiftId.ok).toBe(true)
    expect(pileId.ok).toBe(true)

    if (shiftId.ok && pileId.ok) {
      // @ts-expect-error ShiftId and PileId are distinct branded types and must not be interchangeable
      const misusedAsPileId: PileId = shiftId.value
      expect(misusedAsPileId).toBe(shiftId.value)
    }
  })
})
