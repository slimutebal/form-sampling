import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode } from '@/domain/common/codes'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixturePileId,
  fixturePosition,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import {
  deriveConfirmedSampleBatchTrip,
  deriveSampleBatchLimits,
  deriveSampleBatchProgress,
  deriveSampleProgressBarSegments,
  isTripWithinSampleBatch,
} from './sample-batch-progress'

function must<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function progress(ore: 'SAP' | 'LIM', trip: number) {
  return deriveSampleBatchProgress(
    {
      pileId: fixturePileId('S1_01'),
      oreCode: must(parseOreCode(ore)),
      batch: must(parseBatchNumber(1)),
      rit: must(parseRitNumber(trip)),
    },
    buildFixtureMasterData(),
  )!
}

describe('deriveSampleBatchProgress', () => {
  it('uses the configured SAP interval for produced increments and bags', () => {
    expect(progress('SAP', 2)).toMatchObject({ producedIncrementCount: 1, inHouseBagCount: 1 })
    expect(progress('SAP', 4)).toMatchObject({ producedIncrementCount: 2, inHouseBagCount: 2 })
    expect(progress('SAP', 16)).toMatchObject({ producedIncrementCount: 8, inHouseBagCount: 8 })
  })

  it('uses configured LIM packing as two increments per physical bag', () => {
    expect(progress('LIM', 5)).toMatchObject({ producedIncrementCount: 1, inHouseBagCount: 1 })
    expect(progress('LIM', 10)).toMatchObject({ producedIncrementCount: 2, inHouseBagCount: 1 })
    expect(progress('LIM', 15)).toMatchObject({ producedIncrementCount: 3, inHouseBagCount: 2 })
    expect(progress('LIM', 16)).toMatchObject({ producedIncrementCount: 3, inHouseBagCount: 2 })
    expect(progress('LIM', 20)).toMatchObject({ producedIncrementCount: 4, inHouseBagCount: 2 })
  })

  it('uses the configured batch size to accept valid Trip values and reject over-limit values', () => {
    const masterData = buildFixtureMasterData()
    const sapLimits = deriveSampleBatchLimits(masterData, must(parseOreCode('SAP')))

    expect(sapLimits?.batchCapacity).toBe(20)
    expect(isTripWithinSampleBatch(sapLimits, 20)).toBe(true)
    expect(isTripWithinSampleBatch(sapLimits, 21)).toBe(false)
    expect(isTripWithinSampleBatch(sapLimits, 100)).toBe(false)
  })

  it('derives SAP and LIM physical bag maxima from configured intervals and packing', () => {
    expect(progress('SAP', 15)).toMatchObject({
      producedIncrementCount: 7,
      maximumPhysicalInHouseBags: 7,
    })
    expect(progress('LIM', 69)).toMatchObject({
      producedIncrementCount: 13,
      maximumPhysicalInHouseBags: 7,
    })
  })

  it('renders LIM partial bags as the latest in-house material', () => {
    const segments = deriveSampleProgressBarSegments(progress('LIM', 45), 2)

    expect(progress('LIM', 45)).toMatchObject({
      producedIncrementCount: 9,
      producedBagEquivalent: 4.5,
    })
    expect(segments).toEqual({ greenPercent: 30, redPercent: 15, grayPercent: 55 })
  })

  it('keeps delivered, in-house, and remaining increments distinct', () => {
    const pileId = fixturePileId('S1_01')
    const registration = {
      pileId,
      oreCode: must(parseOreCode('SAP')),
      batch: must(parseBatchNumber(1)),
      rit: must(parseRitNumber(2)),
    }
    const delivered = {
      pileId,
      batchNumber: registration.batch,
      sampledRitNumbers: [
        must(parseRitNumber(2)),
        must(parseRitNumber(4)),
        must(parseRitNumber(6)),
        must(parseRitNumber(8)),
      ],
      delivery: { status: 'DELIVERED' },
    } as unknown as SamplePosition
    const result = deriveSampleBatchProgress(
      registration,
      buildFixtureMasterData(),
      [delivered],
      12,
    )!
    expect(result).toMatchObject({
      currentTrip: 12,
      totalIncrementCount: 10,
      producedIncrementCount: 6,
      deliveredIncrementCount: 4,
      inHouseIncrementCount: 2,
      maximumPhysicalInHouseBags: 2,
      inHouseBagCount: 2,
    })
  })

  it('uses the highest effective production Trip, excluding corrected-away and voided history', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('S1_01')
    const record = (id: string, batch: number, rit: number) =>
      buildFixtureProductionRecord({
        transaction: buildFixtureHaulageTransaction({
          id,
          shiftId: 'SHIFT-1',
          pile,
          batch,
          rit,
          masterData,
          fleetSetup,
        }),
      })
    const correctedSource = record('TX-CORRECTED', 1, 18)
    const correctedAway: ProductionRecord = {
      ...correctedSource,
      effective: { ...correctedSource.effective, batchPosition: fixturePosition(2, 18) },
    } as unknown as ProductionRecord
    const voidedSource = record('TX-VOIDED', 1, 16)
    const voided: ProductionRecord = {
      ...voidedSource,
      effective: { ...voidedSource.effective, status: 'VOIDED' },
    } as unknown as ProductionRecord
    const current = record('TX-CURRENT', 1, 12)

    expect(
      deriveConfirmedSampleBatchTrip(
        [correctedAway, voided, current],
        pile.id,
        must(parseBatchNumber(1)),
      ),
    ).toBe(12)
  })
})
