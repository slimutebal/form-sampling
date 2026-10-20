import { expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { createMasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { parsePastedProductionSamples } from './parse-pasted-production-samples'

function value<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

it('extracts known Pile ID, Batch, and Last Trip into an editable Sample Setup prefill', () => {
  const sector = value(parseSectorCode('S1'))
  const masterData = value(createMasterData({
    employees: [], crews: [], locations: [], samplingHouses: [], haulers: [], trucks: [],
    sectors: [createSectorReference(sector)],
    pileAreas: [createPileAreaReference(sector, value(parsePileAreaCode('STOCK-1')), value(parsePileId('PILE-1')), value(parseOreCode('SAP')))],
    oreSamplingConfigs: [createOreSamplingConfig({
      oreCode: value(parseOreCode('SAP')),
      interval: value(parseSamplingInterval(2)),
      batchSize: value(parseBatchSize(20)),
      packing: value(parsePackingConfigValue(2)),
    })],
  }))

  expect(parsePastedProductionSamples('PILE-1 Batch 12 Last Trip 34', masterData, 'S1')).toMatchObject([
    { pileId: 'PILE-1', batch: 12, rit: 34, status: 'ACTIVE' },
  ])
})
