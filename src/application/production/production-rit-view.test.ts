import { describe, expect, it } from 'vitest'
import { deriveProductionRitViews } from '@/application/production/production-rit-view'
import type { RitNumber } from '@/domain/batch/rit-number'
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

function expectedRange(start: number, end = 20): readonly RitNumber[] {
  const rits: RitNumber[] = []
  for (let rit = start; rit <= end; rit++) {
    rits.push(fixturePosition(1, rit).ritNumber)
  }
  return rits
}

describe('deriveProductionRitViews', () => {
  it('returns one ascending-ordered view per Rit up to the furthest attempted Rit', () => {
    const records = [record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT'), record('TX-3', 3, 'ACCEPT')]
    const views = deriveProductionRitViews(records, pile.id, records[0]!.effective.batchPosition.batchNumber, expectedRange(1))
    expect(views.map((view) => Number(view.ritNumber))).toEqual([1, 2, 3])
  })

  it('an accepted Rit carries its ProductionRecord and is never MISSED', () => {
    const accepted = record('TX-1', 1, 'ACCEPT')
    const views = deriveProductionRitViews([accepted], pile.id, accepted.effective.batchPosition.batchNumber, expectedRange(1))
    expect(views[0]!.acceptedRecord).toBe(accepted)
    expect(views[0]!.missed).toBe(false)
    expect(views[0]!.rejectAttempts).toEqual([])
  })

  it('a gap Rit with only REJECT attempts is MISSED once a later Rit is accepted, and preserves every attempt', () => {
    const rejectA = record('TX-2A', 2, 'REJECT')
    const rejectB = record('TX-2B', 2, 'REJECT')
    const records = [record('TX-1', 1, 'ACCEPT'), rejectA, rejectB, record('TX-3', 3, 'ACCEPT')]
    const views = deriveProductionRitViews(records, pile.id, records[0]!.effective.batchPosition.batchNumber, expectedRange(1))
    const ritTwo = views.find((view) => Number(view.ritNumber) === 2)!
    expect(ritTwo.acceptedRecord).toBeUndefined()
    expect(ritTwo.missed).toBe(true)
    expect(ritTwo.rejectAttempts).toEqual([rejectA, rejectB])
  })

  it('an accepted Rit still exposes prior REJECT attempts at the same position (ACCEPT after REJECT)', () => {
    const rejected = record('TX-2A', 2, 'REJECT')
    const accepted = record('TX-2B', 2, 'ACCEPT')
    const records = [record('TX-1', 1, 'ACCEPT'), rejected, accepted]
    const views = deriveProductionRitViews(records, pile.id, records[0]!.effective.batchPosition.batchNumber, expectedRange(1))
    const ritTwo = views.find((view) => Number(view.ritNumber) === 2)!
    expect(ritTwo.acceptedRecord).toBe(accepted)
    expect(ritTwo.missed).toBe(false)
    expect(ritTwo.rejectAttempts).toEqual([rejected])
  })

  it('a trailing REJECT-only Rit (no later ACCEPT yet) is included but not MISSED', () => {
    const trailingReject = record('TX-2', 2, 'REJECT')
    const records = [record('TX-1', 1, 'ACCEPT'), trailingReject]
    const views = deriveProductionRitViews(records, pile.id, records[0]!.effective.batchPosition.batchNumber, expectedRange(1))
    expect(views).toHaveLength(2)
    const ritTwo = views[1]!
    expect(ritTwo.acceptedRecord).toBeUndefined()
    expect(ritTwo.missed).toBe(false)
    expect(ritTwo.rejectAttempts).toEqual([trailingReject])
  })

  it('a carry-over Batch starting at Rit 11 never renders phantom rows for Rits 1-10', () => {
    const records = [record('TX-11', 11, 'ACCEPT'), record('TX-12', 12, 'ACCEPT')]
    const views = deriveProductionRitViews(records, pile.id, records[0]!.effective.batchPosition.batchNumber, expectedRange(11))
    expect(views.map((view) => Number(view.ritNumber))).toEqual([11, 12])
  })

  it('a VOIDED record never fills acceptedRecord/rejectAttempts but is exposed via voidedRecords', () => {
    const voided = record('TX-1', 1, 'ACCEPT')
    const voidedRecord = { ...voided, effective: { ...voided.effective, status: 'VOIDED' as const } }
    const views = deriveProductionRitViews(
      [voidedRecord],
      pile.id,
      voidedRecord.effective.batchPosition.batchNumber,
      expectedRange(1),
    )
    expect(views).toHaveLength(1)
    expect(views[0]!.acceptedRecord).toBeUndefined()
    expect(views[0]!.rejectAttempts).toEqual([])
    expect(views[0]!.voidedRecords).toEqual([voidedRecord])
  })

  it('a VOIDED-only Rit does not count as an occupied position, so a later ACCEPT still renders the gap as MISSED', () => {
    const voided = record('TX-1', 1, 'ACCEPT')
    const voidedRecord = { ...voided, effective: { ...voided.effective, status: 'VOIDED' as const } }
    const laterAccept = record('TX-2', 2, 'ACCEPT')
    const views = deriveProductionRitViews(
      [voidedRecord, laterAccept],
      pile.id,
      laterAccept.effective.batchPosition.batchNumber,
      expectedRange(1),
    )
    const ritOne = views.find((view) => Number(view.ritNumber) === 1)!
    expect(ritOne.acceptedRecord).toBeUndefined()
    expect(ritOne.missed).toBe(true)
    expect(ritOne.voidedRecords).toEqual([voidedRecord])
  })

  it('returns an empty array when nothing has been recorded for this Pile/Batch yet', () => {
    expect(
      deriveProductionRitViews([], pile.id, record('TX-1', 1, 'ACCEPT').effective.batchPosition.batchNumber, expectedRange(1)),
    ).toEqual([])
  })
})
