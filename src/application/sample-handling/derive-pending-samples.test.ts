import { describe, expect, it } from 'vitest'
import { createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  fixtureShiftId,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { derivePendingSamples } from './derive-pending-samples'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const SHIFT_ID = fixtureShiftId('SHIFT-1')

function transaction(id: string, pile: ReturnType<typeof buildFixtureSapPile>, batch: number, rit: number) {
  return buildFixtureHaulageTransaction({ id, shiftId: 'SHIFT-1', pile, batch, rit, masterData, fleetSetup })
}

describe('derivePendingSamples', () => {
  it('A. a sample-required transaction produces a pending entry', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-1', pile, 24, 2)],
      samplePositions: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.batches).toEqual([{ batchNumber: 24, pendingRitNumbers: [2] }])
  })

  it('B. a non-sample transaction (rit not on the sampling interval) is not pending', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-1', pile, 24, 1)],
      samplePositions: [],
    })
    expect(result).toHaveLength(0)
  })

  it('C. a sampled Rit already handled by an existing SamplePosition does not reappear', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const handled = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-1', pile, 24, 2), transaction('TX-2', pile, 24, 4)],
      samplePositions: [handled],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.batches).toEqual([{ batchNumber: 24, pendingRitNumbers: [4] }])
  })

  it('D. a SamplePosition range handles every sampled Rit it generated, not just its boundary', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const handled = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 6,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [
        transaction('TX-1', pile, 24, 2),
        transaction('TX-2', pile, 24, 4),
        transaction('TX-3', pile, 24, 6),
        transaction('TX-4', pile, 24, 8),
      ],
      samplePositions: [handled],
    })
    expect(result[0]?.batches).toEqual([{ batchNumber: 24, pendingRitNumbers: [8] }])
  })

  it('E. duplicate transaction ids at the same Pile/Batch/Rit do not multiply the pending count', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-1', pile, 24, 2), transaction('TX-2', pile, 24, 2)],
      samplePositions: [],
    })
    expect(result[0]?.batches).toEqual([{ batchNumber: 24, pendingRitNumbers: [2] }])
  })

  it('F. multiple Piles are isolated from each other', () => {
    const pileA = buildFixtureSapPile('PILE-A')
    const pileB = buildFixtureSapPile('PILE-B')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pileA, pileB],
      haulageTransactions: [transaction('TX-A', pileA, 1, 2), transaction('TX-B', pileB, 1, 4)],
      samplePositions: [],
    })
    expect(result).toHaveLength(2)
    expect(result[0]?.pile.id).toBe('PILE-A')
    expect(result[0]?.batches).toEqual([{ batchNumber: 1, pendingRitNumbers: [2] }])
    expect(result[1]?.pile.id).toBe('PILE-B')
    expect(result[1]?.batches).toEqual([{ batchNumber: 1, pendingRitNumbers: [4] }])
  })

  it('G. multiple Batches on one Pile are sorted numerically, not lexicographically', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-9', pile, 9, 2), transaction('TX-10', pile, 10, 2)],
      samplePositions: [],
    })
    expect(result[0]?.batches.map((b) => Number(b.batchNumber))).toEqual([9, 10])
  })

  it('H. haulage transaction input order does not control output ordering', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [
        transaction('TX-10', pile, 10, 2),
        transaction('TX-9', pile, 9, 2),
        transaction('TX-1', pile, 1, 4),
      ],
      samplePositions: [],
    })
    expect(result[0]?.batches.map((b) => Number(b.batchNumber))).toEqual([1, 9, 10])
  })

  it('I. existing SamplePosition input order does not control the pending result', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const handledLater = buildFixtureSamplePosition({
      id: 'SP-LATER',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 4,
      ritTo: 4,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const handledEarlier = buildFixtureSamplePosition({
      id: 'SP-EARLIER',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [transaction('TX-1', pile, 24, 2), transaction('TX-2', pile, 24, 4)],
      samplePositions: [handledLater, handledEarlier],
    })
    expect(result).toHaveLength(0)
  })

  it('a Pile with no pending batches is omitted from the result entirely', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [],
      samplePositions: [],
    })
    expect(result).toEqual([])
  })

  it('a transaction from a different Shift is ignored', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherShiftTransaction = buildFixtureHaulageTransaction({
      id: 'TX-OTHER',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const result = derivePendingSamples({
      shiftId: SHIFT_ID,
      piles: [pile],
      haulageTransactions: [otherShiftTransaction],
      samplePositions: [],
    })
    expect(result).toEqual([])
  })
})
