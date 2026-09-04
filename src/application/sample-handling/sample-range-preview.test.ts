import { describe, expect, it } from 'vitest'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createPile, type Pile } from '@/domain/pile/pile'
import { previewSampleRange } from './sample-range-preview'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: must(parseOreCode('SAP')),
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function sapPile(id: string): Pile {
  return createPile(must(parsePileId(id)), must(parseOreCode('SAP')))
}

const masterData = buildMasterData()

describe('previewSampleRange', () => {
  it('computes the sample range and Total Bag from a Pile/MasterData/Rit boundary', () => {
    const result = previewSampleRange(sapPile('PILE-1'), masterData, must(parseRitNumber(2)), must(parseRitNumber(10)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.range.sampledRitNumbers.map(Number)).toEqual([2, 4, 6, 8, 10])
    expect(Number(result.value.totalBag)).toBe(5)
  })

  it('propagates ORE_SAMPLING_CONFIG_NOT_FOUND for an unconfigured Ore', () => {
    const pile = createPile(must(parsePileId('PILE-X')), must(parseOreCode('UNKNOWN')))
    const result = previewSampleRange(pile, masterData, must(parseRitNumber(2)), must(parseRitNumber(10)))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })

  it('propagates a sample-range error unchanged', () => {
    const result = previewSampleRange(sapPile('PILE-1'), masterData, must(parseRitNumber(10)), must(parseRitNumber(2)))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_REVERSED')
  })
})
