import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { voidProductionRecord } from '@/application/production/void-production-record'
import {
  buildFixtureFleetSetup, buildFixtureHaulageTransaction, buildFixtureMasterData,
  buildFixtureProductionRecord, buildFixtureLimPile, buildFixtureSapPile, fixtureEmployeeId,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import {
  currentPositionForRegistration,
  deriveDashboardBatchSummaries,
  deriveOperationalBatchStates,
  deriveProductionOperationalCounters,
  effectiveProductionRowsForPile,
  formatBatchCode,
  formatBatchPosition,
  formatProductionTripNo,
  formatTripWithinBatch,
  isEffectiveIncrementProductionRecord,
  nextPositionForRegistration,
  sortProductionHistoryRows,
} from './production-record-presentation'

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid')
  return result.value as T
}

describe('production record presentation semantics', () => {
  it('formats Production Trip, Batch, and Batch Trip independently', () => {
    expect([1, 9, 10, 100].map(formatProductionTripNo)).toEqual(['01', '09', '10', '100'])
    expect([5, 9, 10].map(formatBatchCode)).toEqual(['05', '09', '10'])
    expect([1, 7, 15, 100].map(formatTripWithinBatch)).toEqual(['001', '007', '015', '100'])
    expect(formatBatchPosition(5, 7)).toBe('05/007')
  })

  it('uses effective Pile chronology for Trip No and effective Batch positions for Batch display', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT', pile, batch: 5, rit: 7, masterData, fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile, batch: 5, rit: 8, masterData, fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT', pile, batch: 9, rit: 15, masterData, fleetSetup }) }),
    ]
    const rows = effectiveProductionRowsForPile(records, pile.id)
    expect(rows.map((row) => row.tripNo)).toEqual([1, 2, 3])
    expect(rows.map((row) => [row.batchNumber, row.tripWithinBatch])).toEqual([[5, 7], [5, 8], [9, 15]])
  })

  it('uses history over the registration seed and excludes a VOID record from Trip No', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const one = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT', pile, batch: 5, rit: 7, masterData, fleetSetup }) })
    const two = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile, batch: 5, rit: 8, masterData, fleetSetup }) })
    const voided = value(voidProductionRecord({ record: two, reason: 'duplicate', correctedAt: new Date(), correctedBy: fixtureEmployeeId('12345'), generateCorrectionId: () => 'CORR-1' }))
    const registration = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(6)), status: 'ACTIVE' as const }
    expect(currentPositionForRegistration([one, two], registration)).toEqual({ batch: 5, trip: 8 })
    expect(effectiveProductionRowsForPile([one, voided], pile.id).map((row) => row.tripNo)).toEqual([1])
  })

  it('keeps multi-Batch Add positions independent while Trip No remains Pile-wide', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const batchFive = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(6)), status: 'ACTIVE' as const }
    const batchNine = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(9)), rit: value(parseRitNumber(10)), status: 'ACTIVE' as const }
    const firstPosition = value(nextPositionForRegistration(masterData, pile, [], batchFive))
    expect([Number(firstPosition.batchNumber), Number(firstPosition.ritNumber)]).toEqual([5, 7])
    const first = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT', pile, batch: 5, rit: 7, masterData, fleetSetup }) })
    const secondPosition = value(nextPositionForRegistration(masterData, pile, [first], batchNine))
    expect([Number(secondPosition.batchNumber), Number(secondPosition.ritNumber)]).toEqual([9, 11])
    const second = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile, batch: 9, rit: 11, masterData, fleetSetup }) })
    const thirdPosition = value(nextPositionForRegistration(masterData, pile, [first, second], batchFive))
    expect([Number(thirdPosition.batchNumber), Number(thirdPosition.ritNumber)]).toEqual([5, 8])
    const third = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT', pile, batch: 5, rit: 8, masterData, fleetSetup }) })
    const rows = effectiveProductionRowsForPile([first, second, third], pile.id)
    expect(rows.map((row) => [row.tripNo, row.batchNumber, row.tripWithinBatch])).toEqual([[1, 5, 7], [2, 9, 11], [3, 5, 8]])
  })

  it('sorts visible history by immutable record time or numeric Batch position without changing Trip No', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT', pile, batch: 5, rit: 7, masterData, fleetSetup }), createdAt: new Date('2026-09-04T10:00:00Z') }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile, batch: 7, rit: 8, masterData, fleetSetup }), createdAt: new Date('2026-09-04T12:00:00Z') }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT', pile, batch: 5, rit: 8, masterData, fleetSetup }), createdAt: new Date('2026-09-04T11:00:00Z') }),
    ]
    const rows = effectiveProductionRowsForPile(records, pile.id)
    expect(sortProductionHistoryRows(rows, 'rec', 'desc').map((row) => row.tripNo)).toEqual([3, 2, 1])
    expect(sortProductionHistoryRows(rows, 'rec', 'asc').map((row) => row.tripNo)).toEqual([1, 2, 3])
    expect(sortProductionHistoryRows(rows, 'batch', 'desc').map((row) => [row.batchNumber, row.tripWithinBatch])).toEqual([[7, 8], [5, 8], [5, 7]])
    expect(sortProductionHistoryRows(rows, 'batch', 'asc').map((row) => [row.batchNumber, row.tripWithinBatch])).toEqual([[5, 7], [5, 8], [7, 8]])
  })

  it('marks only effective records whose effective position currently requires an increment', () => {
    const masterData = buildFixtureMasterData()
    const sapPile = buildFixtureSapPile('S5_07')
    const limPile = buildFixtureLimPile('S5_08')
    const sapFleet = buildFixtureFleetSetup(masterData, sapPile.id)
    const limFleet = buildFixtureFleetSetup(masterData, limPile.id)
    const sapIncrement = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile: sapPile, batch: 5, rit: 2, masterData, fleetSetup: sapFleet }) })
    const sapNormal = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT', pile: sapPile, batch: 5, rit: 3, masterData, fleetSetup: sapFleet }) })
    const rejectedIncrement = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-4', shiftId: 'SHIFT', pile: sapPile, batch: 5, rit: 4, masterData, fleetSetup: sapFleet }), disposition: 'REJECT' })
    const limIncrement = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-5', shiftId: 'SHIFT', pile: limPile, batch: 5, rit: 5, masterData, fleetSetup: limFleet }) })
    const voided = value(voidProductionRecord({ record: sapIncrement, reason: 'void', correctedAt: new Date(), correctedBy: fixtureEmployeeId('12345'), generateCorrectionId: () => 'CORR-2' }))
    expect(isEffectiveIncrementProductionRecord(sapIncrement, sapPile, masterData)).toBe(true)
    expect(isEffectiveIncrementProductionRecord(sapNormal, sapPile, masterData)).toBe(false)
    expect(isEffectiveIncrementProductionRecord(rejectedIncrement, sapPile, masterData)).toBe(false)
    expect(isEffectiveIncrementProductionRecord(voided, sapPile, masterData)).toBe(false)
    expect(isEffectiveIncrementProductionRecord(limIncrement, limPile, masterData)).toBe(true)
  })

  it('derives Dashboard and pager counters from current effective operational state', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: 'SHIFT', pile, batch: 5, rit: 2, masterData, fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: 'SHIFT', pile, batch: 5, rit: 3, masterData, fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-4', shiftId: 'SHIFT', pile, batch: 5, rit: 4, masterData, fleetSetup, truckId: 'T2' }), disposition: 'REJECT' }),
    ]
    expect(deriveProductionOperationalCounters(records, pile, masterData)).toEqual({
      tripCount: 2,
      incrementCount: 1,
      rejectCount: 1,
      wrongTruckCount: 1,
    })
  })

  it('builds Dashboard Batch cards with completed history left of active registrations', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const accepted = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: 'SHIFT', pile, batch: 5, rit: 7, masterData, fleetSetup }) })
    const registrations = [
      { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(6)), rit: value(parseRitNumber(1)), status: 'ACTIVE' as const },
      { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(1)), status: 'INACTIVE' as const },
    ]
    const operationalBatches = value(deriveOperationalBatchStates(masterData, pile, [accepted], registrations))
    expect(deriveDashboardBatchSummaries([accepted], pile, operationalBatches)).toEqual([
      { batchNumber: 6, isActive: true, currentTripWithinBatch: 1, frontCodes: [] },
      { batchNumber: 5, isActive: false, currentTripWithinBatch: 7, frontCodes: ['F1'] },
    ])
  })

  it('derives direct, continuation, and historical endpoints from capacity plus the explicit successor link', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const batchFive = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(16)), status: 'ACTIVE' as const }
    const batchSix = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(6)), rit: value(parseRitNumber(1)), status: 'ACTIVE' as const, continuationFromBatch: value(parseBatchNumber(5)) }
    const records = [17, 18, 19].map((rit) => buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-' + rit, shiftId: 'SHIFT', pile, batch: 5, rit, masterData, fleetSetup }) }))
    expect(value(deriveOperationalBatchStates(masterData, pile, records, [batchFive, batchSix])).map((batch) => [batch.batchNumber, batch.currentTripWithinBatch, batch.operationalStatus])).toEqual([
      [5, 19, 'DIRECT_ACTIVE'],
      [6, 0, 'DIRECT_ACTIVE'],
    ])
    const complete = [...records, buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-20', shiftId: 'SHIFT', pile, batch: 5, rit: 20, masterData, fleetSetup }) })]
    expect(value(deriveOperationalBatchStates(masterData, pile, complete, [batchFive, batchSix])).map((batch) => batch.operationalStatus)).toEqual(['NEEDS_CONTINUATION', 'DIRECT_ACTIVE'])
    const continued = [...complete, buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-6-1', shiftId: 'SHIFT', pile, batch: 6, rit: 1, masterData, fleetSetup }) })]
    expect(value(deriveOperationalBatchStates(masterData, pile, continued, [batchFive, batchSix])).map((batch) => batch.operationalStatus)).toEqual(['HISTORICAL_COMPLETE', 'DIRECT_ACTIVE'])
  })

  it('keeps a completed batch selectable beside an independent direct endpoint until its chosen successor starts', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const batchFive = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(20)), status: 'ACTIVE' as const }
    const batchNine = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(9)), rit: value(parseRitNumber(18)), status: 'ACTIVE' as const }
    expect(value(deriveOperationalBatchStates(masterData, pile, [], [batchFive, batchNine])).map((batch) => [batch.batchNumber, batch.operationalStatus])).toEqual([
      [5, 'NEEDS_CONTINUATION'],
      [9, 'DIRECT_ACTIVE'],
    ])
    const batchSix = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(6)), rit: value(parseRitNumber(1)), status: 'ACTIVE' as const, continuationFromBatch: value(parseBatchNumber(5)) }
    const firstSuccessor = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-6-1', shiftId: 'SHIFT', pile, batch: 6, rit: 1, masterData, fleetSetup }) })
    expect(value(deriveOperationalBatchStates(masterData, pile, [firstSuccessor], [batchFive, batchSix, batchNine])).map((batch) => [batch.batchNumber, batch.operationalStatus])).toEqual([
      [5, 'HISTORICAL_COMPLETE'],
      [6, 'DIRECT_ACTIVE'],
      [9, 'DIRECT_ACTIVE'],
    ])
  })

  it('recovers an already-recorded unregistered continuation so legacy 05/020 + 06/001 exposes 06, not 05', () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const batchFive = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(20)), status: 'ACTIVE' as const }
    const batchNine = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(9)), rit: value(parseRitNumber(18)), status: 'ACTIVE' as const }
    const completion = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-5-20', shiftId: 'SHIFT', pile, batch: 5, rit: 20, masterData, fleetSetup }) })
    const successor = buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-6-1', shiftId: 'SHIFT', pile, batch: 6, rit: 1, masterData, fleetSetup }) })
    const endpoints = value(deriveOperationalBatchStates(masterData, pile, [completion, successor], [batchFive, batchNine]))
    expect(endpoints.map((batch) => [batch.batchNumber, batch.currentTripWithinBatch, batch.operationalStatus])).toEqual([
      [5, 20, 'HISTORICAL_COMPLETE'],
      [6, 1, 'DIRECT_ACTIVE'],
      [9, 18, 'DIRECT_ACTIVE'],
    ])
    expect(deriveDashboardBatchSummaries([completion, successor], pile, endpoints).map((batch) => batch.batchNumber)).toEqual([9, 6, 5])
  })
})
