import { describe, expect, it } from 'vitest'
import { recordProduction } from '@/application/production/record-production'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixturePosition,
  FIXTURE_FLEET_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const pile = buildFixtureSapPile('PILE-1')
const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
const shift = buildFixtureShift('SHIFT-1')
const createdBy = fixtureEmployeeId('12345')
const createdAt = new Date('2026-09-04T10:00:00.000Z')

function baseParams() {
  return {
    generatedTransactionId: 'TX-1',
    shift,
    pile,
    nextPosition: fixturePosition(1, 1),
    selectedFleetId: FIXTURE_FLEET_ID,
    selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
    masterData,
    fleetSetup,
    physicalCondition: 'DRY' as const,
    contamination: 'CLN' as const,
    disposition: 'ACCEPT' as const,
    createdAt,
    createdBy,
  }
}

describe('recordProduction', () => {
  it('builds a validated HaulageTransaction (via the existing recordHaulage engine) and wraps it in a ProductionRecord', () => {
    const result = recordProduction(baseParams())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction.id).toBe('TX-1')
    expect(result.value.transaction.batchPosition).toEqual(fixturePosition(1, 1))
    expect(result.value.productionRecord.transaction).toBe(result.value.transaction)
    expect(result.value.productionRecord.effective.disposition).toBe('ACCEPT')
    expect(result.value.productionRecord.effective.physicalCondition).toBe('DRY')
    expect(result.value.productionRecord.effective.contamination).toBe('CLN')
    expect(result.value.productionRecord.audit.createdBy).toBe(createdBy)
  })

  it('normalizes a blank remark to null through the domain factory', () => {
    const result = recordProduction({ ...baseParams(), remark: '   ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionRecord.effective.remark).toBeNull()
  })

  it('keeps a trimmed remark', () => {
    const result = recordProduction({ ...baseParams(), remark: '  basah sedikit  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionRecord.effective.remark).toBe('basah sedikit')
  })

  it('derives SamplingEvaluation automatically from Batch/Rit and Ore sampling config, never as caller input', () => {
    // SAP fixture config: interval 2 — Rit 2 is a sample point.
    const result = recordProduction({ ...baseParams(), nextPosition: fixturePosition(1, 2) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction.samplingEvaluation).toEqual({ sampleRequired: true, incrementNumber: 1 })
  })

  it('rejects a known Truck that is not assigned to an active Fleet serving this Pile', () => {
    const result = recordProduction({ ...baseParams(), selectedTruckId: FIXTURE_WRONG_TRUCK_TRUCK_ID })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_NOT_AVAILABLE_FOR_PILE')
  })

  it('propagates a recordHaulage domain error (e.g. unknown truck) without building a ProductionRecord', () => {
    const result = recordProduction({ ...baseParams(), selectedTruckId: 'UNKNOWN-TRUCK' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TRUCK_NOT_FOUND_IN_MASTER')
  })

  it('builds a REJECT ProductionRecord identically otherwise', () => {
    const result = recordProduction({ ...baseParams(), disposition: 'REJECT' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionRecord.effective.disposition).toBe('REJECT')
    expect(result.value.productionRecord.effective.status).toBe('ACTIVE')
  })

  it('stores no observation values for a non-INCR ACCEPT record', () => {
    const result = recordProduction({ ...baseParams(), physicalCondition: null, contamination: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionRecord.effective.physicalCondition).toBeNull()
    expect(result.value.productionRecord.effective.contamination).toBeNull()
  })

  it('requires observations for an INCR or REJECT record', () => {
    const sampled = recordProduction({ ...baseParams(), nextPosition: fixturePosition(1, 2), physicalCondition: null, contamination: null })
    expect(sampled.ok).toBe(false)
    if (!sampled.ok) expect(sampled.error.code).toBe('PRODUCTION_OBSERVATIONS_REQUIRED')
    const rejected = recordProduction({ ...baseParams(), disposition: 'REJECT', physicalCondition: null, contamination: null })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.error.code).toBe('PRODUCTION_OBSERVATIONS_REQUIRED')
  })
})
