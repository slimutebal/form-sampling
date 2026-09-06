import { describe, expect, it } from 'vitest'
import { derivePileHaulagePlan } from './derive-pile-haulage-plan'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createSectorReference } from '@/domain/master/references'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { createPile } from '@/domain/pile/pile'
import { buildFixturePendingBatchCarryOver } from '@/infrastructure/local-db/local-db-test-fixtures'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildMasterData(): MasterData {
  const sap = must(parseOreCode('SAP'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(must(parseSectorCode('BR1')))],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

const PILE = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))

describe('derivePileHaulagePlan', () => {
  it('A. a fresh Pile with no carry-over produces an empty plan, never a Batch 1/Rit 1 fallback', () => {
    const result = derivePileHaulagePlan(PILE, buildMasterData(), [])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('B. a CONTINUE carry-over for this Pile produces the remaining BatchPosition sequence', () => {
    const pendingBatches = [buildFixturePendingBatchCarryOver(PILE, 3, 18, 'CONTINUE')]

    const result = derivePileHaulagePlan(PILE, buildMasterData(), pendingBatches)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((position) => [Number(position.batchNumber), Number(position.ritNumber)])).toEqual([
      [3, 19],
      [3, 20],
    ])
  })

  it('C. a HOLD carry-over for this Pile is never included as an active seed', () => {
    const pendingBatches = [buildFixturePendingBatchCarryOver(PILE, 3, 18, 'HOLD')]

    const result = derivePileHaulagePlan(PILE, buildMasterData(), pendingBatches)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('D. carry-over rows for a different Pile are ignored', () => {
    const otherPile = createPile(must(parsePileId('PILE-OTHER')), must(parseOreCode('SAP')))
    const pendingBatches = [buildFixturePendingBatchCarryOver(otherPile, 3, 18, 'CONTINUE')]

    const result = derivePileHaulagePlan(PILE, buildMasterData(), pendingBatches)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('F. a fresh Pile with a confirmed freshStartPosition plans from that exact position', () => {
    const result = derivePileHaulagePlan(PILE, buildMasterData(), [], {
      batchNumber: must(parseBatchNumber(25)),
      ritNumber: must(parseRitNumber(11)),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.slice(0, 3).map((position) => [Number(position.batchNumber), Number(position.ritNumber)])).toEqual([
      [25, 11],
      [25, 12],
      [25, 13],
    ])
    expect(result.value).toHaveLength(10)
  })

  it('G. a default freshStartPosition (Batch 1 / Rit 1) plans the whole batch from the start', () => {
    const result = derivePileHaulagePlan(PILE, buildMasterData(), [], {
      batchNumber: must(parseBatchNumber(1)),
      ritNumber: must(parseRitNumber(1)),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]).toEqual({ batchNumber: 1, ritNumber: 1 })
    expect(result.value).toHaveLength(20)
  })

  it('H. freshStartPosition is ignored when real CONTINUE carry-over already exists for this Pile', () => {
    const pendingBatches = [buildFixturePendingBatchCarryOver(PILE, 3, 18, 'CONTINUE')]

    const result = derivePileHaulagePlan(PILE, buildMasterData(), pendingBatches, {
      batchNumber: must(parseBatchNumber(1)),
      ritNumber: must(parseRitNumber(1)),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((position) => [Number(position.batchNumber), Number(position.ritNumber)])).toEqual([
      [3, 19],
      [3, 20],
    ])
  })

  it('E. a Pile whose Ore has no OreSamplingConfig fails explicitly', () => {
    const unconfiguredPile = createPile(must(parsePileId('PILE-2')), must(parseOreCode('LIM')))

    const result = derivePileHaulagePlan(unconfiguredPile, buildMasterData(), [])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })
})
