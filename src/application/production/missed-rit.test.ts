import { describe, expect, it } from 'vitest'
import { deriveMissedRits } from '@/application/production/missed-rit'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixturePosition,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')
const otherPile = buildFixtureSapPile('PILE-2')
const batch1 = fixturePosition(1, 1).batchNumber

function record(id: string, rit: number, disposition: 'ACCEPT' | 'REJECT', batch = 1, forPile = pile) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile: forPile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition })
}

function accept(id: string, rit: number, batch = 1, forPile = pile) {
  return record(id, rit, 'ACCEPT', batch, forPile)
}

function reject(id: string, rit: number, batch = 1, forPile = pile) {
  return record(id, rit, 'REJECT', batch, forPile)
}

function markVoided(source: ProductionRecord): ProductionRecord {
  return {
    ...source,
    effective: { ...source.effective, status: 'VOIDED' },
  } as unknown as ProductionRecord
}

/** An expected-Rits array for the given inclusive range — mirrors what `deriveExpectedRitsForBatch` would resolve for a Batch operating over that range (Rit 1..20, a carry-over start at 11, a fresh start at 5, etc). */
function expectedRange(start: number, end = 20): readonly RitNumber[] {
  const rits: RitNumber[] = []
  for (let rit = start; rit <= end; rit++) {
    rits.push(fixturePosition(1, rit).ritNumber)
  }
  return rits
}

describe('deriveMissedRits', () => {
  it('normal Batch starting Rit 1: accepted 1,2,4 => missed 3', () => {
    const records = [accept('TX-1', 1), accept('TX-2', 2), accept('TX-4', 4)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1)).map(Number)).toEqual([3])
  })

  it('carry-over start at 11: accepted 11,12 => no missed (Rits 1..10 are never candidates)', () => {
    const records = [accept('TX-11', 11), accept('TX-12', 12)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(11))).toEqual([])
  })

  it('carry-over start at 11: accepted 11,13 => missed 12 only, never 1..10', () => {
    const records = [accept('TX-11', 11), accept('TX-13', 13)]
    const missed = deriveMissedRits(records, pile.id, batch1, expectedRange(11)).map(Number)
    expect(missed).toEqual([12])
    expect(missed).not.toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  })

  it('fresh start at Rit 5: accepted 5,6 => no missed (Rits 1..4 are never candidates)', () => {
    const records = [accept('TX-5', 5), accept('TX-6', 6)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(5))).toEqual([])
  })

  it('fresh start at Rit 5: accepted 5,7 => missed 6 only, never 1..4', () => {
    const records = [accept('TX-5', 5), accept('TX-7', 7)]
    const missed = deriveMissedRits(records, pile.id, batch1, expectedRange(5)).map(Number)
    expect(missed).toEqual([6])
    expect(missed).not.toEqual(expect.arrayContaining([1, 2, 3, 4]))
  })

  it('never returns a Rit before the authoritative expected range, even when it would otherwise look like a gap', () => {
    // If expectedRits started at 1 this would report 1..10 as missed; bounded to the real start (11), it must not.
    const records = [accept('TX-11', 11), accept('TX-15', 15)]
    const missed = deriveMissedRits(records, pile.id, batch1, expectedRange(11)).map(Number)
    expect(Math.min(...missed)).toBeGreaterThanOrEqual(11)
    expect(missed).toEqual([12, 13, 14])
  })

  it('never returns a trailing position past the furthest accepted Rit, even when it is still in the expected range', () => {
    const records = [accept('TX-11', 11), accept('TX-12', 12)]
    // expectedRange(11) includes 13..20 (still ahead) — none of those are missed yet.
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(11))).toEqual([])
  })

  it('REJECT does not fill a position — an expected gap remains MISSED once a later ACCEPT exists', () => {
    const records = [accept('TX-1', 1), accept('TX-2', 2), reject('TX-3', 3), accept('TX-4', 4)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1)).map(Number)).toEqual([3])
  })

  it('VOIDED does not fill a position — a voided ACCEPT leaves its Rit MISSED once a later Rit is accepted', () => {
    const voidedAccept = markVoided(accept('TX-3', 3))
    const records = [accept('TX-1', 1), accept('TX-2', 2), voidedAccept, accept('TX-4', 4)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1)).map(Number)).toEqual([3])
  })

  it('a trailing REJECT-only position (no later ACCEPT yet) is not MISSED', () => {
    const records = [accept('TX-1', 1), accept('TX-2', 2), reject('TX-3', 3)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1))).toEqual([])
  })

  it('repeated REJECT attempts at the same Rit still leave it MISSED once a later Rit is accepted', () => {
    const records = [accept('TX-1', 1), reject('TX-2', 2), reject('TX-2B', 2), accept('TX-3', 3)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1)).map(Number)).toEqual([2])
  })

  it('uses effective.batchPosition, not the original transaction.batchPosition, for missed detection', () => {
    const source = accept('TX-2', 2)
    // Simulates a future SWITCH_POSITION correction moving this record's
    // effective position to Rit 5 while its original transaction snapshot
    // (immutable audit fact) still says Rit 2 — missed detection must
    // follow the corrected `effective` position, not the transaction's.
    const corrected: ProductionRecord = {
      ...source,
      effective: { ...source.effective, batchPosition: fixturePosition(1, 5) },
    } as unknown as ProductionRecord
    const records = [accept('TX-1', 1), corrected, accept('TX-6', 6)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1)).map(Number)).toEqual([2, 3, 4])
  })

  it('returns missed Rit numbers sorted ascending regardless of expectedRits input order', () => {
    const records = [accept('TX-1', 1), accept('TX-6', 6)]
    const shuffledExpected = [...expectedRange(1, 6)].reverse()
    const missed = deriveMissedRits(records, pile.id, batch1, shuffledExpected).map(Number)
    expect(missed).toEqual([2, 3, 4, 5])
  })

  it('scopes strictly to the given Pile — another Pile’s records never leak in', () => {
    const records = [accept('TX-1', 1, 1, pile), accept('TX-2', 4, 1, otherPile)]
    expect(deriveMissedRits(records, pile.id, batch1, expectedRange(1))).toEqual([])
  })

  it('returns an empty array when nothing has been accepted yet', () => {
    expect(deriveMissedRits([], pile.id, batch1, expectedRange(1))).toEqual([])
    expect(deriveMissedRits([reject('TX-1', 1)], pile.id, batch1, expectedRange(1))).toEqual([])
  })
})
