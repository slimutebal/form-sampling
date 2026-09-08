import { describe, expect, it } from 'vitest'
import {
  isEffectiveProductionRecord,
  selectEffectiveProductionRecords,
  selectEffectiveTransactions,
} from '@/application/production/effective-production'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { createLegacyProductionRecord } from '@/domain/production/production-record'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')

function transaction(id: string, rit: number) {
  return buildFixtureHaulageTransaction({ id, shiftId: 'SHIFT-1', pile, batch: 24, rit, masterData, fleetSetup })
}

describe('isEffectiveProductionRecord', () => {
  it('is true for ACCEPT + ACTIVE', () => {
    const record = buildFixtureProductionRecord({ transaction: transaction('TX-1', 1), disposition: 'ACCEPT' })
    expect(isEffectiveProductionRecord(record)).toBe(true)
  })

  it('is false for REJECT + ACTIVE', () => {
    const record = buildFixtureProductionRecord({ transaction: transaction('TX-2', 2), disposition: 'REJECT' })
    expect(isEffectiveProductionRecord(record)).toBe(false)
  })

  it('is true for a legacy migrated record (always ACCEPT + ACTIVE)', () => {
    const record = createLegacyProductionRecord(transaction('TX-3', 3))
    expect(isEffectiveProductionRecord(record)).toBe(true)
  })
})

describe('selectEffectiveProductionRecords / selectEffectiveTransactions', () => {
  it('keeps only ACCEPT + ACTIVE records and their transactions, preserving input order', () => {
    const acceptRecord = buildFixtureProductionRecord({ transaction: transaction('TX-A', 1), disposition: 'ACCEPT' })
    const rejectRecord = buildFixtureProductionRecord({ transaction: transaction('TX-B', 2), disposition: 'REJECT' })
    const anotherAcceptRecord = buildFixtureProductionRecord({ transaction: transaction('TX-C', 3), disposition: 'ACCEPT' })

    const records = [acceptRecord, rejectRecord, anotherAcceptRecord]

    expect(selectEffectiveProductionRecords(records)).toEqual([acceptRecord, anotherAcceptRecord])
    expect(selectEffectiveTransactions(records).map((tx) => tx.id)).toEqual(['TX-A', 'TX-C'])
  })

  it('returns an empty array when every record is REJECT', () => {
    const records = [buildFixtureProductionRecord({ transaction: transaction('TX-1', 1), disposition: 'REJECT' })]
    expect(selectEffectiveProductionRecords(records)).toEqual([])
    expect(selectEffectiveTransactions(records)).toEqual([])
  })
})
