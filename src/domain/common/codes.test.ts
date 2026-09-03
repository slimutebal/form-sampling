import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from './codes'

type CodeParser = (value: string) => { readonly ok: boolean }

const parsers: ReadonlyArray<readonly [string, CodeParser]> = [
  ['ShiftCode', parseShiftCode],
  ['SectorCode', parseSectorCode],
  ['SamplingHouseCode', parseSamplingHouseCode],
  ['OreCode', parseOreCode],
]

describe('domain codes', () => {
  it.each(parsers)('%s accepts a valid non-empty value', (_label, parse) => {
    expect(parse('BR1').ok).toBe(true)
  })

  it.each(parsers)('%s rejects a blank value', (_label, parse) => {
    expect(parse('').ok).toBe(false)
  })

  it.each(parsers)('%s rejects a whitespace-only value', (_label, parse) => {
    expect(parse('   ').ok).toBe(false)
  })

  it('OreCode can represent current values without a hard-coded master-data enum', () => {
    expect(parseOreCode('SAP').ok).toBe(true)
    expect(parseOreCode('LIM').ok).toBe(true)
    expect(parseOreCode('FUTURE_ORE').ok).toBe(true)
  })
})
