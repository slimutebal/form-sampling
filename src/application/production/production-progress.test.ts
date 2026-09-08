import { describe, expect, it } from 'vitest'
import { deriveHaulageProgress } from '@/application/haulage-operation/derive-haulage-progress'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { recordProduction } from '@/application/production/record-production'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import { remainingPositionsFromStart } from '@/domain/batch/batch-engine'
import { findOreSamplingConfig } from '@/domain/master/master-data'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixturePosition,
  FIXTURE_FLEET_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'

/**
 * Cross-cutting Phase 2 behavior: the progress/pending-sample engines
 * must operate on effective (ACCEPT + ACTIVE) ProductionRecord state,
 * never blindly on every persisted HaulageTransaction. Exercised here
 * end-to-end through the real composition every caller uses:
 * `recordProduction` -> `selectEffectiveTransactions` ->
 * `deriveHaulageProgress` / `derivePendingSamples`.
 */

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const shift = buildFixtureShift('SHIFT-1')
const pile = buildFixtureSapPile('PILE-1') // SAP: interval 2, batchSize 20
const createdBy = fixtureEmployeeId('12345')
const createdAt = new Date('2026-09-04T10:00:00.000Z')
const oreSamplingConfig = findOreSamplingConfig(masterData, pile.oreCode)
if (!oreSamplingConfig) throw new Error('invalid test setup')
const expectedPositionsResult = remainingPositionsFromStart(fixturePosition(1, 1), oreSamplingConfig.batchSize)
if (!expectedPositionsResult.ok) throw new Error('invalid test setup')
const expectedPositions = expectedPositionsResult.value

function record(
  id: string,
  rit: number,
  disposition: 'ACCEPT' | 'REJECT',
  batch = 1,
): ProductionRecord {
  const result = recordProduction({
    generatedTransactionId: id,
    shift,
    pile,
    nextPosition: fixturePosition(batch, rit),
    selectedFleetId: FIXTURE_FLEET_ID,
    selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
    masterData,
    fleetSetup,
    physicalCondition: 'DRY',
    contamination: 'CLN',
    disposition,
    createdAt,
    createdBy,
  })
  if (!result.ok) throw new Error(`invalid test setup: ${result.error.code}`)
  return result.value.productionRecord
}

function nextPositionFor(records: readonly ProductionRecord[]) {
  const progress = deriveHaulageProgress({
    shiftId: shift.id,
    pileId: pile.id,
    expectedPositions,
    transactions: selectEffectiveTransactions(records),
  })
  if (!progress.ok) throw new Error(`invalid test setup: ${progress.error.code}`)
  return progress.value.nextPosition
}

describe('production progress — ACCEPT/REJECT effective state', () => {
  it('an empty history starts at Batch 1 / Rit 1', () => {
    expect(nextPositionFor([])).toEqual(fixturePosition(1, 1))
  })

  it('ACCEPT consumes the current production position and advances normally', () => {
    const accept1 = record('TX-1', 1, 'ACCEPT')
    expect(nextPositionFor([accept1])).toEqual(fixturePosition(1, 2))
  })

  it('REJECT does not advance the position — the same Rit stays next', () => {
    const accept1 = record('TX-1', 1, 'ACCEPT')
    const reject2 = record('TX-2', 2, 'REJECT')
    expect(nextPositionFor([accept1, reject2])).toEqual(fixturePosition(1, 2))
  })

  it('ACCEPT after REJECT uses the same Batch/Rit the REJECT targeted, then advances past it', () => {
    const accept1 = record('TX-1', 1, 'ACCEPT')
    const reject2 = record('TX-2', 2, 'REJECT')
    // The operator re-records the same Rit 2 position, this time ACCEPT, with a new Transaction_ID.
    const accept2 = record('TX-3', 2, 'ACCEPT')
    expect(nextPositionFor([accept1, reject2, accept2])).toEqual(fixturePosition(1, 3))
  })

  it('repeated REJECT attempts at the same Batch/Rit are allowed when Transaction_ID differs, and neither advances the position', () => {
    const accept1 = record('TX-1', 1, 'ACCEPT')
    const reject2a = record('TX-2', 2, 'REJECT')
    const reject2b = record('TX-2B', 2, 'REJECT')
    expect(nextPositionFor([accept1, reject2a, reject2b])).toEqual(fixturePosition(1, 2))
  })

  it('REJECT does not become a pending sample, even though its own SamplingEvaluation snapshot is preserved for audit', () => {
    // Rit 2 is a sample point for SAP (interval 2).
    const accept1 = record('TX-1', 1, 'ACCEPT')
    const reject2 = record('TX-2', 2, 'REJECT')
    expect(reject2.transaction.samplingEvaluation).toEqual({ sampleRequired: true, incrementNumber: 1 })

    const records = [accept1, reject2]
    const pendingUsingEffectiveState = derivePendingSamples({
      shiftId: shift.id,
      piles: [pile],
      haulageTransactions: selectEffectiveTransactions(records),
      samplePositions: [],
    })
    expect(pendingUsingEffectiveState).toEqual([])

    // Demonstrates the bug the refactor fixes: feeding raw, unfiltered
    // transactions would have counted the REJECTed Rit 2 as pending.
    const pendingUsingRawTransactions = derivePendingSamples({
      shiftId: shift.id,
      piles: [pile],
      haulageTransactions: records.map((r) => r.transaction),
      samplePositions: [],
    })
    expect(pendingUsingRawTransactions).not.toEqual([])
  })
})
