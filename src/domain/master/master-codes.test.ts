import { describe, expect, it } from 'vitest'
import { parseCrewCode, parseHaulerCode, parseLocationCode, parsePileAreaCode, type LocationCode } from './master-codes'

type CodeParser = (value: string) => { readonly ok: boolean }

const parsers: ReadonlyArray<readonly [string, CodeParser]> = [
  ['CrewCode', parseCrewCode],
  ['LocationCode', parseLocationCode],
  ['PileAreaCode', parsePileAreaCode],
  ['HaulerCode', parseHaulerCode],
]

describe('master codes', () => {
  it.each(parsers)('%s accepts a valid non-empty value', (_label, parse) => {
    expect(parse('BR1').ok).toBe(true)
  })

  it.each(parsers)('%s rejects a blank value', (_label, parse) => {
    expect(parse('').ok).toBe(false)
  })

  it.each(parsers)('%s rejects a whitespace-only value', (_label, parse) => {
    expect(parse('   ').ok).toBe(false)
  })

  it('trims surrounding whitespace, following the Phase 2 convention', () => {
    const result = parseCrewCode('  CREW-A  ')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('CREW-A')
    }
  })

  it('keeps distinct branded master code types incompatible at compile time', () => {
    const crewCode = parseCrewCode('CREW-A')
    const locationCode = parseLocationCode('LOC-A')
    expect(crewCode.ok).toBe(true)
    expect(locationCode.ok).toBe(true)

    if (crewCode.ok && locationCode.ok) {
      // @ts-expect-error CrewCode and LocationCode are distinct branded types and must not be interchangeable
      const misusedAsLocationCode: LocationCode = crewCode.value
      expect(misusedAsLocationCode).toBe(crewCode.value)
    }
  })
})
