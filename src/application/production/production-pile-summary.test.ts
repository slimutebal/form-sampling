import { describe, expect, it } from 'vitest'
import { deriveProductionBatchSummaries } from '@/application/production/production-batch-summary'
import { deriveProductionPileSummary } from '@/application/production/production-pile-summary'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixtureShiftId,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1') // SAP: interval 2, batchSize 20

function record(
  id: string,
  rit: number,
  disposition: 'ACCEPT' | 'REJECT',
  options: { batch?: number; truckId?: string } = {},
) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch: options.batch ?? 1,
    rit,
    masterData,
    fleetSetup,
    truckId: options.truckId,
  })
  return buildFixtureProductionRecord({ transaction, disposition })
}

function markVoided(source: ProductionRecord): ProductionRecord {
  return {
    ...source,
    effective: { ...source.effective, status: 'VOIDED' },
  } as unknown as ProductionRecord
}

function summaryFor(records: readonly ProductionRecord[]) {
  const pendingSamplePiles = derivePendingSamples({
    shiftId: fixtureShiftId('SHIFT-1'),
    piles: [pile],
    haulageTransactions: selectEffectiveTransactions(records),
    samplePositions: [],
  })
  const batchSummariesResult = deriveProductionBatchSummaries(pile, masterData, records)
  if (!batchSummariesResult.ok) throw new Error('invalid test setup')
  return deriveProductionPileSummary(pile, records, pendingSamplePiles, batchSummariesResult.value)
}

describe('deriveProductionPileSummary', () => {
  it('batchTotal counts distinct Batch numbers with >=1 ACCEPT + ACTIVE record', () => {
    const records = [
      record('TX-1', 1, 'ACCEPT', { batch: 1 }),
      record('TX-2', 2, 'ACCEPT', { batch: 1 }),
      record('TX-3', 1, 'ACCEPT', { batch: 2 }),
      record('TX-4', 1, 'REJECT', { batch: 3 }), // REJECT never contributes to batchTotal
    ]
    expect(summaryFor(records).batchTotal).toBe(2)
  })

  it('acceptRitCount is the ACCEPT + ACTIVE record count', () => {
    const records = [record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT'), record('TX-3', 3, 'REJECT')]
    expect(summaryFor(records).acceptRitCount).toBe(2)
  })

  it('rejectCount counts REJECT + ACTIVE records and excludes VOIDED rejects', () => {
    const activeReject = record('TX-1', 1, 'REJECT')
    const voidedReject = markVoided(record('TX-2', 2, 'REJECT'))
    const records = [activeReject, voidedReject, record('TX-3', 3, 'ACCEPT')]
    expect(summaryFor(records).rejectCount).toBe(1)
  })

  it('wrongTruckCount is event-level over ACTIVE records regardless of disposition, using the stored truck-validation snapshot', () => {
    const wrongTruckAccept = record('TX-1', 1, 'ACCEPT', { truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID })
    const wrongTruckReject = record('TX-2', 2, 'REJECT', { truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID })
    const voidedWrongTruck = markVoided(record('TX-3', 3, 'ACCEPT', { truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID }))
    const validTruck = record('TX-4', 4, 'ACCEPT')
    const records = [wrongTruckAccept, wrongTruckReject, voidedWrongTruck, validTruck]
    expect(summaryFor(records).wrongTruckCount).toBe(2)
  })

  it('sampleTotal only counts ACCEPT + ACTIVE records whose samplingEvaluation.sampleRequired is true', () => {
    // SAP interval = 2: even Rit numbers are sample points.
    const records = [
      record('TX-1', 2, 'ACCEPT'), // sample required, counted
      record('TX-2', 4, 'REJECT'), // sample required but REJECT — never counted
      record('TX-3', 1, 'ACCEPT'), // not a sample point
    ]
    expect(summaryFor(records).sampleTotal).toBe(1)
  })

  it('pendingSampleCount reuses derivePendingSamples rather than recomputing sample-delivery logic', () => {
    // Rit 2 requires sampling and has no SamplePosition covering it -> pending.
    const records = [record('TX-1', 2, 'ACCEPT')]
    expect(summaryFor(records).pendingSampleCount).toBe(1)
  })

  it('missedBatchNumbers mirrors selectMissedBatches over the resolved batch summaries', () => {
    const records = [record('TX-1', 1, 'ACCEPT', { batch: 5 }), record('TX-2', 3, 'ACCEPT', { batch: 5 })]
    expect(summaryFor(records).missedBatchNumbers.map(Number)).toEqual([5])
  })

  it('carries pileId/oreCode from the Pile itself', () => {
    const summary = summaryFor([])
    expect(summary.pileId).toBe(pile.id)
    expect(summary.oreCode).toBe(pile.oreCode)
    expect(summary.batchTotal).toBe(0)
  })
})
