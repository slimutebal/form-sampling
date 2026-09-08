import { describe, expect, it } from 'vitest'
import { editProductionRecord } from '@/application/production/edit-production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixtureEmployeeId,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')
const correctedBy = fixtureEmployeeId('12345')
const correctedAt = new Date('2026-09-08T02:14:00.000Z')

function baseParams(overrides: Partial<Parameters<typeof editProductionRecord>[0]> = {}) {
  const transaction = buildFixtureHaulageTransaction({
    id: 'TX-1',
    shiftId: 'SHIFT-1',
    pile,
    batch: 1,
    rit: 1,
    masterData,
    fleetSetup,
  })
  const record = buildFixtureProductionRecord({ transaction })
  return {
    record,
    allRecordsForShift: [record],
    masterData,
    fleetSetup,
    selectedFrontId: FIXTURE_FRONT_ID,
    selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
    physicalCondition: 'DRY' as const,
    contamination: 'CLN' as const,
    disposition: 'ACCEPT' as const,
    remark: undefined,
    reason: 'Salah input truck',
    correctedAt,
    correctedBy,
    generateCorrectionId: () => 'CORR-1',
    ...overrides,
  }
}

describe('editProductionRecord', () => {
  it('changes effective fields only, keeping the original transaction untouched', () => {
    const params = baseParams({ selectedTruckId: FIXTURE_WRONG_TRUCK_TRUCK_ID })
    const result = editProductionRecord(params)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.truckId).toBe(FIXTURE_WRONG_TRUCK_TRUCK_ID)
    expect(result.value.transaction).toBe(params.record.transaction)
    expect(result.value.transaction.truckId).toBe(FIXTURE_IN_FLEET_TRUCK_ID)
  })

  it('re-classifies Wrong Truck via the domain engine for the selected effective Front/Truck', () => {
    const result = editProductionRecord(baseParams({ selectedTruckId: FIXTURE_WRONG_TRUCK_TRUCK_ID }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.truckValidation.status).toBe('WRONG_TRUCK')
  })

  it('resolving back to the in-fleet truck classifies VALID again', () => {
    const wrongTruckTransaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    const record = buildFixtureProductionRecord({ transaction: wrongTruckTransaction })
    const result = editProductionRecord(
      baseParams({ record, allRecordsForShift: [record], selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.truckValidation.status).toBe('VALID')
  })

  it('fails with FRONT_NOT_AVAILABLE_FOR_PILE for an unknown Front', () => {
    const result = editProductionRecord(baseParams({ selectedFrontId: 'UNKNOWN-FRONT' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_AVAILABLE_FOR_PILE')
  })

  it('requires a non-blank reason', () => {
    const result = editProductionRecord(baseParams({ reason: '   ' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REASON_REQUIRED')
  })

  it('sets updatedBy/updatedAt and appends one EDIT_FIELDS correction', () => {
    const result = editProductionRecord(baseParams())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.audit.updatedAt).toEqual(correctedAt)
    expect(result.value.audit.updatedBy).toBe('12345')
    expect(result.value.audit.corrections).toHaveLength(1)
    expect(result.value.audit.corrections[0]!.type).toBe('EDIT_FIELDS')
  })

  it('normalizes a blank remark to null', () => {
    const result = editProductionRecord(baseParams({ remark: '   ' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.remark).toBeNull()
  })

  it('blocks REJECT -> ACCEPT when another ACCEPT + ACTIVE record already occupies the same position', () => {
    const rejectTransaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const rejectRecord = buildFixtureProductionRecord({ transaction: rejectTransaction, disposition: 'REJECT' })

    const occupantTransaction = buildFixtureHaulageTransaction({
      id: 'TX-2',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const occupantRecord = buildFixtureProductionRecord({ transaction: occupantTransaction, disposition: 'ACCEPT' })

    const result = editProductionRecord(
      baseParams({
        record: rejectRecord,
        allRecordsForShift: [rejectRecord, occupantRecord],
        disposition: 'ACCEPT',
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_POSITION_OCCUPIED')
  })

  it('allows REJECT -> ACCEPT when the position is empty', () => {
    const rejectTransaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const rejectRecord = buildFixtureProductionRecord({ transaction: rejectTransaction, disposition: 'REJECT' })

    const result = editProductionRecord(
      baseParams({ record: rejectRecord, allRecordsForShift: [rejectRecord], disposition: 'ACCEPT' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.disposition).toBe('ACCEPT')
  })

  it('never touches Batch/Rit — Edit cannot move a record', () => {
    const result = editProductionRecord(baseParams())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.effective.batchPosition.batchNumber)).toBe(1)
    expect(Number(result.value.effective.batchPosition.ritNumber)).toBe(1)
  })
})
