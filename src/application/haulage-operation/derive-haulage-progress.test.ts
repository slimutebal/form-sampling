import { describe, expect, it } from 'vitest'
import { deriveHaulageProgress } from './derive-haulage-progress'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSapPile,
  fixturePosition,
  fixtureShiftId,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const SHIFT_ID = fixtureShiftId('SHIFT-1')
const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')

function transaction(id: string, batch: number, rit: number) {
  return buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
}

describe('deriveHaulageProgress', () => {
  it('A. no records: next is the first expected position', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11), fixturePosition(24, 12), fixturePosition(24, 13)],
      transactions: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 11))
    expect(result.value.recordedPositions).toEqual([])
    expect(result.value.skippedPositions).toEqual([])
    expect(result.value.planExhausted).toBe(false)
  })

  it('B. sequential progress: 24/11 recorded moves next to 24/12', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11), fixturePosition(24, 12), fixturePosition(24, 13)],
      transactions: [transaction('TX-1', 24, 11)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 12))
    expect(result.value.recordedPositions).toHaveLength(1)
    expect(result.value.recordedPositions[0]?.position).toEqual(fixturePosition(24, 11))
  })

  it('C. internal gap: 24/11 is skipped once 24/12 is recorded, and never returned as next', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [
        fixturePosition(24, 10),
        fixturePosition(24, 11),
        fixturePosition(24, 12),
        fixturePosition(24, 13),
      ],
      transactions: [transaction('TX-1', 24, 10), transaction('TX-2', 24, 12)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skippedPositions).toEqual([fixturePosition(24, 11)])
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 13))
    expect(result.value.nextPosition).not.toEqual(fixturePosition(24, 11))
  })

  it('D. tail not skipped: a missing position with no later record is not skipped', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 10), fixturePosition(24, 11)],
      transactions: [transaction('TX-1', 24, 10)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skippedPositions).toEqual([])
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 11))
  })

  it('E. duplicate expected position is rejected', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11), fixturePosition(24, 11)],
      transactions: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_EXPECTED_HAULAGE_POSITION')
  })

  it('F. a recorded position outside the expected sequence is rejected', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11)],
      transactions: [transaction('TX-1', 5, 5)],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE')
  })

  it('G. duplicate recorded position: two transaction ids at the same position do not invent a correction rule', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11), fixturePosition(24, 12)],
      transactions: [transaction('TX-1', 24, 11), transaction('TX-2', 24, 11)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.recordedPositions).toHaveLength(1)
    expect(result.value.recordedPositions[0]?.transactions).toHaveLength(2)
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 12))
  })

  it('K. an empty plan fails explicitly and never invents Batch 1', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [],
      transactions: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HAULAGE_PLAN_EMPTY')
  })

  it('L. plan exhausted: next is undefined once the last expected position is recorded, no "complete" field is invented', () => {
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 19), fixturePosition(24, 20)],
      transactions: [transaction('TX-1', 24, 19), transaction('TX-2', 24, 20)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextPosition).toBeUndefined()
    expect(result.value.planExhausted).toBe(true)
    expect(Object.keys(result.value)).not.toContain('complete')
  })

  it('scopes transactions to the given Shift/Pile only', () => {
    const otherShiftTransaction = buildFixtureHaulageTransaction({
      id: 'TX-OTHER',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 24,
      rit: 11,
      masterData,
      fleetSetup,
    })
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions: [fixturePosition(24, 11)],
      transactions: [otherShiftTransaction],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextPosition).toEqual(fixturePosition(24, 11))
    expect(result.value.recordedPositions).toEqual([])
  })

  it('R. never synthesizes intermediate batch numbers not present in the authoritative plan', () => {
    // Batches 25-30 are simply absent from expectedPositions (e.g. no
    // pending work exists for them). The engine must jump straight from
    // 24/20 to 31/19 — it must never infer/insert positions for the
    // missing batch numbers in between.
    const expectedPositions = [
      fixturePosition(24, 19),
      fixturePosition(24, 20),
      fixturePosition(31, 19),
      fixturePosition(31, 20),
      fixturePosition(32, 15),
    ]
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions,
      transactions: [transaction('TX-1', 24, 19), transaction('TX-2', 24, 20)],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextPosition).toEqual(fixturePosition(31, 19))
    expect(result.value.skippedPositions).toEqual([])
  })

  it('S. recordedPositions is ordered by the authoritative expectedPositions plan, never by transaction input/array order', () => {
    const expectedPositions = [
      fixturePosition(24, 19),
      fixturePosition(24, 20),
      fixturePosition(31, 19),
      fixturePosition(31, 20),
      fixturePosition(32, 15),
    ]
    // Supplied deliberately out of plan order (reverse of how they'd be
    // recorded operationally) — recordedPositions must still come back
    // in expectedPositions plan order, not input order.
    const transactions = [
      transaction('TX-B', 24, 20),
      transaction('TX-A', 24, 19),
    ]
    const result = deriveHaulageProgress({
      shiftId: SHIFT_ID,
      pileId: pile.id,
      expectedPositions,
      transactions,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.recordedPositions.map((entry) => entry.position)).toEqual([
      fixturePosition(24, 19),
      fixturePosition(24, 20),
    ])
    expect(result.value.nextPosition).toEqual(fixturePosition(31, 19))
  })
})
