import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { findOreSamplingConfig } from '@/domain/master/master-data'
import { deriveCurrentBatchSampleCount } from './current-batch-sample-count'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureSapPile,
  fixtureShiftId,
} from '@/test/fixtures/haulage-operation-test-fixtures'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const shiftId = fixtureShiftId('SHIFT-1')

describe('deriveCurrentBatchSampleCount', () => {
  it('zero sampled: no recorded transactions in the batch yet', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const count = deriveCurrentBatchSampleCount([], shiftId, pile.id, must(parseBatchNumber(1)), config)
    expect(count).toEqual({ sampled: 0, max: 10 })
  })

  it('some sampled: counts only the sample-flagged positions (SAP interval 2)', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const transactions = [
      buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT-1', pile, batch: 1, rit: 3, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-4', shiftId: 'SHIFT-1', pile, batch: 1, rit: 4, masterData, fleetSetup }),
    ]
    const count = deriveCurrentBatchSampleCount(transactions, shiftId, pile.id, must(parseBatchNumber(1)), config)
    expect(count).toEqual({ sampled: 2, max: 10 })
  })

  it('completed batch: every sample increment recorded reaches max/max', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const transactions = Array.from({ length: 20 }, (_, index) =>
      buildFixtureHaulageTransaction({
        id: `TX-${index + 1}`,
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: index + 1,
        masterData,
        fleetSetup,
      }),
    )
    const count = deriveCurrentBatchSampleCount(transactions, shiftId, pile.id, must(parseBatchNumber(1)), config)
    expect(count).toEqual({ sampled: 10, max: 10 })
  })

  it('SAP config uses interval 2 / batch 20 -> max 10', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    expect(deriveCurrentBatchSampleCount([], shiftId, pile.id, must(parseBatchNumber(1)), config).max).toBe(10)
  })

  it('LIM config uses interval 5 / batch 100 -> max 20', () => {
    const pile = buildFixtureLimPile('PILE-2')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    expect(deriveCurrentBatchSampleCount([], shiftId, pile.id, must(parseBatchNumber(1)), config).max).toBe(20)
  })

  it('counts a re-recorded (e.g. wrong-truck-corrected) position at the same Rit only once', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const transactions = [
      buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
    ]
    const count = deriveCurrentBatchSampleCount(transactions, shiftId, pile.id, must(parseBatchNumber(1)), config)
    expect(count.sampled).toBe(1)
  })

  it('an overridden fresh starting Rit (e.g. Batch 5 starting at Rit 11) still counts correctly', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const transactions = [
      buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT-1', pile, batch: 5, rit: 11, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT-1', pile, batch: 5, rit: 12, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT-1', pile, batch: 5, rit: 14, masterData, fleetSetup }),
    ]
    const count = deriveCurrentBatchSampleCount(transactions, shiftId, pile.id, must(parseBatchNumber(5)), config)
    expect(count).toEqual({ sampled: 2, max: 10 })
  })

  it('ignores transactions from a different Shift, Pile, or Batch', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-OTHER')
    const config = findOreSamplingConfig(masterData, pile.oreCode)!
    const transactions = [
      buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT-OTHER', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT-1', pile: otherPile, batch: 1, rit: 2, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT-1', pile, batch: 2, rit: 2, masterData, fleetSetup }),
    ]
    const count = deriveCurrentBatchSampleCount(transactions, shiftId, pile.id, must(parseBatchNumber(1)), config)
    expect(count.sampled).toBe(0)
  })
})
