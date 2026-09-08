import { describe, expect, it } from 'vitest'
import { deriveProductionBatchSummaries, selectMissedBatches } from '@/application/production/production-batch-summary'
import { parseOreCode } from '@/domain/common/codes'
import { parseFreshPileStartPosition } from '@/domain/pile/fresh-pile-start-position'
import { createPile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixturePendingBatchCarryOver,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixturePileId,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1') // SAP: batchSize 20

function record(id: string, rit: number, disposition: 'ACCEPT' | 'REJECT', batch = 1) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition })
}

function must<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.error)}`)
  return result.value as T
}

describe('deriveProductionBatchSummaries', () => {
  it('fails with ORE_SAMPLING_CONFIG_NOT_FOUND when the Pile\'s Ore has no configured BatchSize', () => {
    const unconfiguredPile = createPile(fixturePileId('PILE-X'), (() => {
      const result = parseOreCode('ZZZ')
      if (!result.ok) throw new Error('invalid test fixture')
      return result.value
    })())
    const result = deriveProductionBatchSummaries(unconfiguredPile, masterData, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })

  it('uses the Ore-specific configured BatchSize, never a hardcoded value', () => {
    const limPile = buildFixtureLimPile('PILE-LIM') // LIM: batchSize 100
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const records: ProductionRecord[] = [buildFixtureProductionRecord({ transaction, disposition: 'ACCEPT' })]
    const sapSummaries = must(deriveProductionBatchSummaries(pile, masterData, [record('TX-2', 1, 'ACCEPT')]))
    const limSummaries = must(deriveProductionBatchSummaries(limPile, masterData, records))
    expect(Number(sapSummaries[0]!.batchSize)).toBe(20)
    expect(Number(limSummaries[0]!.batchSize)).toBe(100)
  })

  it('marks a Batch COMPLETE once the distinct ACCEPT + ACTIVE Rit count reaches BatchSize', () => {
    const records: ProductionRecord[] = []
    for (let rit = 1; rit <= 20; rit++) {
      records.push(record(`TX-${rit}`, rit, 'ACCEPT'))
    }
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.status).toBe('COMPLETE')
    expect(summaries[0]!.acceptRitCount).toBe(20)
  })

  it('marks a Batch ACTIVE when it has effective production but has not reached BatchSize', () => {
    const records = [record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT')]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    expect(summaries[0]!.status).toBe('ACTIVE')
  })

  it('marks a registered CONTINUE carry-over Batch PENDING when it has zero effective production yet', () => {
    const pendingBatches = [buildFixturePendingBatchCarryOver(pile, 3, 5, 'CONTINUE')]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, [], pendingBatches))
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.status).toBe('PENDING')
    expect(summaries[0]!.acceptRitCount).toBe(0)
  })

  it('a HOLD carry-over row never contributes a Batch to the summary', () => {
    const pendingBatches = [buildFixturePendingBatchCarryOver(pile, 9, 5, 'HOLD')]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, [], pendingBatches))
    expect(summaries).toHaveLength(0)
  })

  it('reports missedRits per Batch, and reject/sample/wrong-truck counts scoped to that Batch', () => {
    const records = [
      record('TX-1', 1, 'ACCEPT', 4),
      record('TX-2', 2, 'ACCEPT', 4), // Rit 2 is a sample point (SAP interval 2)
      record('TX-3', 3, 'REJECT', 4), // missed
      record('TX-4', 4, 'ACCEPT', 4),
    ]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    const batch4 = summaries.find((summary) => Number(summary.batchNumber) === 4)!
    expect(batch4.acceptRitCount).toBe(3)
    expect(batch4.rejectCount).toBe(1)
    // SAP interval 2: Rit 2 and Rit 4 are both sample points.
    expect(batch4.sampleCount).toBe(2)
    expect(batch4.missedRits.map(Number)).toEqual([3])
  })

  it('sorts Batches ascending by BatchNumber', () => {
    const records = [record('TX-1', 1, 'ACCEPT', 9), record('TX-2', 1, 'ACCEPT', 2), record('TX-3', 1, 'ACCEPT', 5)]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    expect(summaries.map((summary) => Number(summary.batchNumber))).toEqual([2, 5, 9])
  })

  it('bounds missedRits to a CONTINUE carry-over Batch\'s own start — never reports Rits before Last_Rit+1', () => {
    // Previous shift's Last_Rit for Batch 3 was 10 -> this Batch operates over Rit 11..20.
    const pendingBatches = [buildFixturePendingBatchCarryOver(pile, 3, 10, 'CONTINUE')]
    const records = [record('TX-11', 11, 'ACCEPT', 3), record('TX-13', 13, 'ACCEPT', 3)]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records, pendingBatches))
    const batch3 = summaries.find((summary) => Number(summary.batchNumber) === 3)!
    expect(batch3.missedRits.map(Number)).toEqual([12])
  })

  it('bounds missedRits to a confirmed fresh-pile start Rit — never reports Rits before it', () => {
    const freshStartPosition = must(parseFreshPileStartPosition(4, 5))
    const freshPile = createPile(fixturePileId('PILE-FRESH'), pile.oreCode, freshStartPosition)
    const transactionAt = (id: string, rit: number) =>
      buildFixtureHaulageTransaction({ id, shiftId: 'SHIFT-1', pile: freshPile, batch: 4, rit, masterData, fleetSetup })
    const records = [
      buildFixtureProductionRecord({ transaction: transactionAt('TX-5', 5), disposition: 'ACCEPT' }),
      buildFixtureProductionRecord({ transaction: transactionAt('TX-7', 7), disposition: 'ACCEPT' }),
    ]
    const summaries = must(deriveProductionBatchSummaries(freshPile, masterData, records))
    const batch4 = summaries.find((summary) => Number(summary.batchNumber) === 4)!
    expect(batch4.missedRits.map(Number)).toEqual([6])
  })
})

describe('selectMissedBatches', () => {
  it('reshapes only the Batches with >=1 missed Rit, never recomputing them', () => {
    const records = [
      record('TX-1', 1, 'ACCEPT', 7),
      record('TX-2', 4, 'ACCEPT', 7), // Batch 7: Rit 2, 3 missed
      record('TX-3', 1, 'ACCEPT', 2),
      record('TX-4', 2, 'ACCEPT', 2), // Batch 2: no missed Rit
    ]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    const missed = selectMissedBatches(summaries)
    expect(missed.map((batch) => Number(batch.batchNumber))).toEqual([7])
    expect(missed[0]!.missedRits.map(Number)).toEqual([2, 3])
  })

  it('returns an empty array when no Batch has a missed Rit', () => {
    const records = [record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT')]
    const summaries = must(deriveProductionBatchSummaries(pile, masterData, records))
    expect(selectMissedBatches(summaries)).toEqual([])
  })
})
