import { describe, expect, it } from 'vitest'
import { deriveCanonicalPileArea } from '@/domain/master/canonical-pile-id'
import { parseSectorCode } from '@/domain/common/codes'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function sector(code: string) {
  return value(parseSectorCode(code))
}

describe('deriveCanonicalPileArea', () => {
  const cases: ReadonlyArray<{
    pileId: string
    sector: string
    stockpileCode: string
    oreCode: string
  }> = [
    { pileId: 'L4_05', sector: 'BR1', stockpileCode: 'LS_04', oreCode: 'LIM' },
    { pileId: 'L4_S05', sector: 'BR1', stockpileCode: 'LS_04', oreCode: 'SAP' },
    { pileId: 'S5_02', sector: 'BR1', stockpileCode: 'SS_05', oreCode: 'SAP' },
    { pileId: 'S5_L02', sector: 'BR1', stockpileCode: 'SS_05', oreCode: 'LIM' },
    { pileId: 'DS-C4_L06', sector: 'DS', stockpileCode: 'DS-C_04', oreCode: 'LIM' },
    { pileId: 'DS-C4_S06', sector: 'DS', stockpileCode: 'DS-C_04', oreCode: 'SAP' },
  ]

  for (const testCase of cases) {
    it(`derives ${testCase.pileId} → ${testCase.stockpileCode} / ${testCase.oreCode}`, () => {
      const result = deriveCanonicalPileArea(testCase.pileId, sector(testCase.sector))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.sectorCode).toBe(testCase.sector)
      expect(result.value.stockpileCode).toBe(testCase.stockpileCode)
      expect(result.value.oreCode).toBe(testCase.oreCode)
    })
  }

  it('rejects a DS-C Pile_ID when the current shift Sector is not DS', () => {
    const result = deriveCanonicalPileArea('DS-C4_L06', sector('BR1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_ID_SECTOR_MISMATCH')
  })

  it('rejects an unsupported/irregular naming pattern rather than guessing', () => {
    const result = deriveCanonicalPileArea('WEIRD_LEGACY_NAME_01', sector('BR1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_ID_PATTERN_NOT_SUPPORTED')
  })
})
