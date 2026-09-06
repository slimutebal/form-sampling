import { describe, expect, it } from 'vitest'
import { createPileAreaFromDraft, type NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  const br1 = value(parseSectorCode('BR1'))
  const sap = value(parseOreCode('SAP'))
  const lim = value(parseOreCode('LIM'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(br1)],
      locations: [],
      samplingHouses: [],
      pileAreas: [createPileAreaReference(br1, value(parsePileAreaCode('LS_18')), value(parsePileId('L18_S09')), sap)],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
        createOreSamplingConfig({
          oreCode: lim,
          interval: value(parseSamplingInterval(5)),
          batchSize: value(parseBatchSize(100)),
          packing: value(parsePackingConfigValue(10)),
        }),
      ],
    }),
  )
}

describe('createPileAreaFromDraft', () => {
  const sectorCode = value(parseSectorCode('BR1'))

  it('builds a valid PileAreaReference for a genuinely new Pile_ID, deriving Stockpile/Ore from its grammar', () => {
    const draft: NewPileDraft = { pileId: 'L18_S99' }
    const result = createPileAreaFromDraft(draft, sectorCode, buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      sectorCode: 'BR1',
      stockpileCode: 'LS_18',
      pileId: 'L18_S99',
      oreCode: 'SAP',
    })
  })

  it('rejects a Pile_ID that already exists in master', () => {
    const draft: NewPileDraft = { pileId: 'L18_S09' }
    const result = createPileAreaFromDraft(draft, sectorCode, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_AREA_PILE_ID')
  })

  it('rejects a Pile_ID matching no confirmed canonical naming pattern', () => {
    const draft: NewPileDraft = { pileId: 'WEIRD_LEGACY_NAME_01' }
    const result = createPileAreaFromDraft(draft, sectorCode, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_ID_PATTERN_NOT_SUPPORTED')
  })

  it('rejects a blank Pile_ID', () => {
    const draft: NewPileDraft = { pileId: '  ' }
    const result = createPileAreaFromDraft(draft, sectorCode, buildMasterData())
    expect(result.ok).toBe(false)
  })
})
