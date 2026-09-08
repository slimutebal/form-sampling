import { describe, expect, it } from 'vitest'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'
import { parseSectorCode } from '@/domain/common/codes'
import { validateTruckForFleet } from '@/domain/fleet/truck-validation'
import { createMasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference } from '@/domain/master/references'
import { applyEditFields, applySwitchPosition, applyVoidRecord } from '@/domain/production/production-correction'
import type { ProductionRecord } from '@/domain/production/production-record'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import {
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_EMPLOYEE_NAME,
  FIXTURE_FLEET_ID,
  FIXTURE_FRONT_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixtureFleetId,
  fixtureFrontId,
  fixturePosition,
  fixtureTruckId,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { buildShiftReport, type BuildShiftReportInput } from './build-shift-report'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const destination = parseDeliveryDestinationCode('LAB-1')
if (!destination.ok) throw new Error('bad fixture')
const fixtureSectorCode = parseSectorCode('S1')
if (!fixtureSectorCode.ok) throw new Error('bad fixture')
const fixtureStockpileCode = parsePileAreaCode('STOCK-1')
if (!fixtureStockpileCode.ok) throw new Error('bad fixture')

const CORRECTED_AT = new Date('2026-09-04T11:00:00.000Z')
const CORRECTED_BY = fixtureEmployeeId(FIXTURE_EMPLOYEE_ID)

function mustCorrectionId(value: string) {
  const result = parseProductionCorrectionId(value)
  if (!result.ok) throw new Error('bad fixture')
  return result.value
}

/** Wraps a single fixture HaulageTransaction into a validated ACCEPT/ACTIVE ProductionRecord unless overridden. */
function acceptedRecord(
  ...params: Parameters<typeof buildFixtureHaulageTransaction>
): ProductionRecord {
  return buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction(...params) })
}

function voidedRecord(record: ProductionRecord): ProductionRecord {
  const result = applyVoidRecord(record, {
    correctionId: mustCorrectionId('C-VOID'),
    reason: 'test void',
    correctedAt: CORRECTED_AT,
    correctedBy: CORRECTED_BY,
  })
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

function switchedRecord(record: ProductionRecord, targetBatch: number, targetRit: number): ProductionRecord {
  const result = applySwitchPosition(record, {
    correctionId: mustCorrectionId('C-SWITCH'),
    targetPosition: fixturePosition(targetBatch, targetRit),
    reason: 'test switch',
    correctedAt: CORRECTED_AT,
    correctedBy: CORRECTED_BY,
  })
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

function editDisposition(record: ProductionRecord, disposition: 'ACCEPT' | 'REJECT'): ProductionRecord {
  const result = applyEditFields(record, {
    correctionId: mustCorrectionId('C-EDIT'),
    frontId: record.effective.frontId,
    fleetId: record.effective.fleetId,
    truckId: record.effective.truckId,
    truckValidation: record.effective.truckValidation,
    physicalCondition: record.effective.physicalCondition ?? 'DRY',
    contamination: record.effective.contamination ?? 'CLN',
    disposition,
    remark: record.effective.remark,
    positionOccupiedByOther: false,
    reason: 'test disposition edit',
    correctedAt: CORRECTED_AT,
    correctedBy: CORRECTED_BY,
  })
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

/** Re-truck a record onto the known-wrong fixture truck, reclassified via the real `validateTruckForFleet` engine (mirrors what `editProductionRecord` does). */
function editToWrongTruck(record: ProductionRecord): ProductionRecord {
  const truckValidation = validateTruckForFleet(
    masterData,
    fleetSetup,
    fixtureFleetId(FIXTURE_FLEET_ID),
    fixtureTruckId(FIXTURE_WRONG_TRUCK_TRUCK_ID),
  )
  if (!truckValidation.ok) throw new Error('bad fixture')
  const result = applyEditFields(record, {
    correctionId: mustCorrectionId('C-EDIT-TRUCK'),
    frontId: fixtureFrontId(FIXTURE_FRONT_ID),
    fleetId: fixtureFleetId(FIXTURE_FLEET_ID),
    truckId: fixtureTruckId(FIXTURE_WRONG_TRUCK_TRUCK_ID),
    truckValidation: truckValidation.value,
    physicalCondition: record.effective.physicalCondition ?? 'DRY',
    contamination: record.effective.contamination ?? 'CLN',
    disposition: record.effective.disposition,
    remark: record.effective.remark,
    positionOccupiedByOther: false,
    reason: 'test truck edit',
    correctedAt: CORRECTED_AT,
    correctedBy: CORRECTED_BY,
  })
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

function baseInput(overrides: Partial<BuildShiftReportInput> = {}): BuildShiftReportInput {
  const pile = buildFixtureSapPile('PILE-1')
  return {
    language: 'en',
    shift: buildFixtureShift('SHIFT-1'),
    piles: [pile],
    productionRecords: [],
    samplePositions: [],
    masterData,
    manpowerAssignments: [],
    ...overrides,
  }
}

describe('buildShiftReport — header', () => {
  it('takes Date, Shift and ISO week from the Shift', () => {
    const result = buildShiftReport(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.header.date).toBe('2026-09-04')
    expect(result.value.header.shiftCode).toBe('D')
    expect(result.value.header.isoWeek).toEqual({ isoYear: 2026, isoWeekNumber: 36 })
  })

  it.each([
    ['DS', 'D'],
    ['NS', 'N'],
    ['D', 'D'],
  ] as const)('shiftCodeLabel maps %s to %s (Phase 18 §1) without changing the stored shiftCode', (shiftCode, expectedLabel) => {
    const shift = { ...buildFixtureShift('SHIFT-1'), shiftCode } as BuildShiftReportInput['shift']
    const result = buildShiftReport(baseInput({ shift }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.header.shiftCode).toBe(shiftCode)
    expect(result.value.header.shiftCodeLabel).toBe(expectedLabel)
  })
})

describe('buildShiftReport — Haulage Detail Stockpile (Phase 18 §11)', () => {
  it('resolves Stockpile from Pile_Areas master when available', () => {
    const pile = buildFixtureSapPile('PILE-STOCK')
    const stockpileMasterDataResult = createMasterData({
      ...masterData,
      pileAreas: [createPileAreaReference(fixtureSectorCode.value, fixtureStockpileCode.value, pile.id, pile.oreCode)],
    })
    if (!stockpileMasterDataResult.ok) throw new Error('invalid test fixture')
    const stockpileMasterData = stockpileMasterDataResult.value
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        masterData: stockpileMasterData,
        productionRecords: [
          buildFixtureProductionRecord({
            transaction: buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData: stockpileMasterData, fleetSetup }),
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail[0]?.stockpileCode).toBe('STOCK-1')
  })

  it('leaves Stockpile undefined (never blocking the rest of the report) when the Pile has no master row', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail[0]?.stockpileCode).toBeUndefined()
  })
})

describe('buildShiftReport — production summary/totals (effective ACCEPT + ACTIVE only)', () => {
  it('single pile: Rit/Batch/Increment/Wrong Truck', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 4, masterData, fleetSetup }),
          acceptedRecord({
            id: 'T-3',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 6,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([
      { pileId: 'PILE-1', oreCode: 'SAP', rit: 3, batch: 1, increment: 3, wrongTruck: 1 },
    ])
    expect(result.value.productionTotals).toEqual({ rit: 3, batch: 1, increment: 3, wrongTruck: 1 })
  })

  it('SAP and LIM piles both produce rows, Ore comes from the workspace Pile', () => {
    const sapPile = buildFixtureSapPile('PILE-SAP')
    const limPile = buildFixtureLimPile('PILE-LIM')
    const result = buildShiftReport(
      baseInput({
        piles: [sapPile, limPile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile: sapPile, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile: limPile, batch: 1, rit: 5, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([
      { pileId: 'PILE-SAP', oreCode: 'SAP', rit: 1, batch: 1, increment: 1, wrongTruck: 0 },
      { pileId: 'PILE-LIM', oreCode: 'LIM', rit: 1, batch: 1, increment: 1, wrongTruck: 0 },
    ])
  })

  it('distinct Batch is counted per Pile, not per transaction', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-3', shiftId: 'SHIFT-1', pile, batch: 2, rit: 1, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.rit).toBe(3)
    expect(result.value.productionSummary[0]?.batch).toBe(2)
  })

  it('the same Batch number on different Piles counts separately in the total (never one global Set)', () => {
    const pileA = buildFixtureSapPile('PILE-A')
    const pileB = buildFixtureSapPile('PILE-B')
    const result = buildShiftReport(
      baseInput({
        piles: [pileA, pileB],
        productionRecords: [
          acceptedRecord({ id: 'T-A', shiftId: 'SHIFT-1', pile: pileA, batch: 1, rit: 1, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-B', shiftId: 'SHIFT-1', pile: pileB, batch: 1, rit: 1, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary.map((row) => row.batch)).toEqual([1, 1])
    expect(result.value.productionTotals.batch).toBe(2)
  })

  it('Increment counts the effective sampling requirement for the current position', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.increment).toBe(1)
  })

  it('Wrong Truck counts the effective truckValidation, never the original transaction snapshot', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
          acceptedRecord({
            id: 'T-2',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 2,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.wrongTruck).toBe(1)
  })

  it('totals equal the sum of the production summary rows', () => {
    const pileA = buildFixtureSapPile('PILE-A')
    const pileB = buildFixtureLimPile('PILE-B')
    const result = buildShiftReport(
      baseInput({
        piles: [pileA, pileB],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile: pileA, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile: pileA, batch: 2, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-3', shiftId: 'SHIFT-1', pile: pileB, batch: 1, rit: 5, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { productionSummary, productionTotals } = result.value
    expect(productionTotals).toEqual({
      rit: productionSummary.reduce((sum, row) => sum + row.rit, 0),
      batch: productionSummary.reduce((sum, row) => sum + row.batch, 0),
      increment: productionSummary.reduce((sum, row) => sum + row.increment, 0),
      wrongTruck: productionSummary.reduce((sum, row) => sum + row.wrongTruck, 0),
    })
  })

  it('empty production: no rows, zero totals; a Pile with no records gets no row', () => {
    const result = buildShiftReport(baseInput({ piles: [buildFixtureSapPile('PILE-1')], productionRecords: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([])
    expect(result.value.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
  })
})

describe('buildShiftReport — Phase 22 corrections and disposition/status', () => {
  it('a REJECT record contributes zero Rit/Batch/Increment/Wrong Truck', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const record = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      disposition: 'REJECT',
    })
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [record] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([])
    expect(result.value.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
  })

  it('a VOIDED ACCEPT record contributes zero production', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const record = voidedRecord(acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }))
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [record] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([])
    expect(result.value.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
    // VOIDED never appears in the visual Haulage Detail listing either (§8).
    expect(result.value.haulageDetail).toEqual([])
  })

  it('an EDIT_FIELDS correction from ACCEPT to REJECT removes the record from production', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const accepted = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const before = buildShiftReport(baseInput({ piles: [pile], productionRecords: [accepted] }))
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.value.productionTotals.rit).toBe(1)

    const corrected = editDisposition(accepted, 'REJECT')
    const after = buildShiftReport(baseInput({ piles: [pile], productionRecords: [corrected] }))
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
  })

  it('an EDIT_FIELDS correction from REJECT to ACCEPT adds the record to production', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const rejected = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      disposition: 'REJECT',
    })
    const before = buildShiftReport(baseInput({ piles: [pile], productionRecords: [rejected] }))
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.value.productionTotals.rit).toBe(0)

    const corrected = editDisposition(rejected, 'ACCEPT')
    const after = buildShiftReport(baseInput({ piles: [pile], productionRecords: [corrected] }))
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.productionTotals.rit).toBe(1)
  })

  it('a MOVE (SWITCH_POSITION) correction reports at the target Batch/Rit, never the transaction original', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const accepted = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const moved = switchedRecord(accepted, 2, 3)
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail[0]).toMatchObject({ batchNumber: 2, ritNumber: 3 })
    expect(result.value.productionSummary[0]).toMatchObject({ batch: 1, rit: 1 })
  })

  it('a SWAP exchanges effective positions between two records', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const recordA = acceptedRecord({ id: 'T-A', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const recordB = acceptedRecord({ id: 'T-B', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const swappedA = switchedRecord(recordA, 1, 2)
    const swappedB = switchedRecord(recordB, 1, 1)
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [swappedA, swappedB] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const byTransactionId = Object.fromEntries(result.value.haulageDetail.map((row) => [row.transactionId, row]))
    expect(byTransactionId['T-A']).toMatchObject({ ritNumber: 2 })
    expect(byTransactionId['T-B']).toMatchObject({ ritNumber: 1 })
  })

  it('an EDIT_FIELDS truck correction reclassifies Wrong Truck using the effective validation, never the original', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const accepted = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const before = buildShiftReport(baseInput({ piles: [pile], productionRecords: [accepted] }))
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.value.productionTotals.wrongTruck).toBe(0)

    const corrected = editToWrongTruck(accepted)
    const after = buildShiftReport(baseInput({ piles: [pile], productionRecords: [corrected] }))
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.productionTotals.wrongTruck).toBe(1)
    expect(after.value.wrongTruck).toHaveLength(1)
    expect(after.value.wrongTruck[0]?.truckId).toBe(FIXTURE_WRONG_TRUCK_TRUCK_ID)
    expect(after.value.haulageDetail[0]?.truckStatus).toBe('WRONG_TRUCK')
  })

  it('Increment follows the effective sampling requirement after a position correction, not the original transaction snapshot', () => {
    const pile = buildFixtureSapPile('PILE-1')
    // SAP interval is 2: Rit 1 is not a sample point, Rit 2 is.
    const accepted = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const before = buildShiftReport(baseInput({ piles: [pile], productionRecords: [accepted] }))
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.value.productionSummary[0]?.increment).toBe(0)
    expect(before.value.haulageDetail[0]?.sampleStatus).toBe('NOT_REQUIRED')

    const moved = switchedRecord(accepted, 1, 2)
    const after = buildShiftReport(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.productionSummary[0]?.increment).toBe(1)
    expect(after.value.haulageDetail[0]?.sampleStatus).toBe('REQUIRED')
  })

  it('Batch totals use the effective position: moving a record to a different Batch shifts which Batch is counted', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const accepted = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const moved = switchedRecord(accepted, 5, 1)
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.batch).toBe(1)
    expect(result.value.haulageDetail[0]?.batchNumber).toBe(5)
  })

  it('the visual Haulage Detail listing includes ACTIVE REJECT rows (a full operational listing, not the compact summary)', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const rejected = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      disposition: 'REJECT',
    })
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [rejected] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail).toHaveLength(1)
    expect(result.value.haulageDetail[0]?.transactionId).toBe('T-1')
  })
})

describe('buildShiftReport — sample handling', () => {
  it('DELIVERED position: status, destination and localized label', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createDeliveredDelivery(destination.value),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position], language: 'en' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.status).toBe('DELIVERED')
    expect(row?.statusLabel).toBe('Delivered')
    expect(row?.destination).toBe('LAB-1')
  })

  it('NOT_PICKED_UP position: status, no destination, localized label', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position], language: 'en' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.status).toBe('NOT_PICKED_UP')
    expect(row?.statusLabel).toBe('Not Picked Up')
    expect(row?.destination).toBeUndefined()
  })

  it('dispatcher present: preserved and resolved from MasterData', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createDeliveredDelivery(destination.value, fixtureEmployeeId(FIXTURE_EMPLOYEE_ID)),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.dispatcherEmployeeId).toBe(FIXTURE_EMPLOYEE_ID)
    expect(row?.dispatcherName).toBe(FIXTURE_EMPLOYEE_NAME)
  })

  it('dispatcher absent: DELIVERED without a dispatcher stays valid, no dispatcher fields', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createDeliveredDelivery(destination.value),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.dispatcherEmployeeId).toBeUndefined()
    expect(row?.dispatcherName).toBeUndefined()
  })

  it('SAP range: Increment From/To come from stored sampledRitNumbers', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(Number(row?.incrementFrom)).toBe(2)
    expect(Number(row?.incrementTo)).toBe(4)
    expect(Number(row?.totalBag)).toBe(2)
  })

  it('LIM range with fractional Total Bag (0.5), preserved without rounding', () => {
    const limPile = buildFixtureLimPile('PILE-LIM')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 5,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [limPile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(Number(row?.incrementFrom)).toBe(5)
    expect(Number(row?.incrementTo)).toBe(5)
    expect(Number(row?.totalBag)).toBe(0.5)
  })
})

describe('buildShiftReport — manpower', () => {
  it('carries personId/name/jobDeskCode through exactly as given (Phase 18 §4 — never re-resolved from master here)', () => {
    const result = buildShiftReport(
      baseInput({
        manpowerAssignments: [
          { personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.manpower).toEqual([
      {
        date: '2026-09-04',
        shiftCode: 'D',
        location: 'S1/HOUSE-1',
        jobDeskCode: 'FOREMAN',
        employeeId: FIXTURE_EMPLOYEE_ID,
        employeeName: FIXTURE_EMPLOYEE_NAME,
      },
    ])
  })

  it('accepts a Crew-sourced personId just as readily as an Employee one (Phase 18 §4)', () => {
    const result = buildShiftReport(
      baseInput({
        manpowerAssignments: [{ personId: 'CREW-1', name: 'Andri Tani Kusuma', jobDeskCode: 'Sampler' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.manpower[0]).toMatchObject({ employeeId: 'CREW-1', employeeName: 'Andri Tani Kusuma' })
  })

  it('empty manpower is allowed', () => {
    const result = buildShiftReport(baseInput({ manpowerAssignments: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.manpower).toEqual([])
  })
})

describe('buildShiftReport — pending samples', () => {
  it('an unhandled sampled Rit appears as pending', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([{ pileId: 'PILE-1', oreCode: 'SAP', batchNumber: 1, pendingRitNumbers: [2] }])
  })

  it('a handled sample does not reappear', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const handled = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })],
        samplePositions: [handled],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([])
  })

  it('duplicate physical haulage position does not multiply the pending count', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([{ pileId: 'PILE-1', oreCode: 'SAP', batchNumber: 1, pendingRitNumbers: [2] }])
  })

  it('a REJECT record never generates a pending physical sample requirement', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const rejected = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      disposition: 'REJECT',
    })
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [rejected] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([])
  })
})

describe('buildShiftReport — wrong truck and haulage detail', () => {
  it('wrong truck rows carry Transaction_ID, Pile, Batch, Rit, Front, Truck and reasons', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        productionRecords: [
          acceptedRecord({
            id: 'T-1',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 1,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.wrongTruck).toEqual([
      {
        transactionId: 'T-1',
        pileId: 'PILE-1',
        batchNumber: 1,
        ritNumber: 1,
        frontId: 'F1',
        truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
        reasons: ['NOT_IN_EFFECTIVE_FLEET'],
        reasonLabels: ['Not In Effective Fleet'],
      },
    ])
  })

  it('haulage detail keeps Batch and Rit as separate numeric fields, not a combined string, and carries localized status labels', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        language: 'en',
        piles: [pile],
        productionRecords: [
          acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          acceptedRecord({
            id: 'T-2',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 4,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [validRow, wrongTruckRow] = result.value.haulageDetail
    expect(validRow?.batchNumber).toBe(1)
    expect(validRow?.ritNumber).toBe(2)
    expect(validRow?.sampleStatus).toBe('REQUIRED')
    expect(validRow?.sampleStatusLabel).toBe('Required')
    expect(validRow?.truckStatus).toBe('VALID')
    expect(validRow?.truckStatusLabel).toBe('Valid')
    expect(validRow?.oreCode).toBe('SAP')
    expect(validRow?.wrongTruckReasons).toEqual([])
    expect(validRow?.wrongTruckReasonLabels).toEqual([])

    expect(wrongTruckRow?.truckStatus).toBe('WRONG_TRUCK')
    expect(wrongTruckRow?.truckStatusLabel).toBe('Wrong Truck')
    expect(wrongTruckRow?.wrongTruckReasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    expect(wrongTruckRow?.wrongTruckReasonLabels).toEqual(['Not In Effective Fleet'])
  })

  it('never displays a raw sample-status/truck-status/reason code as its own label', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        language: 'id',
        piles: [pile],
        productionRecords: [
          acceptedRecord({
            id: 'T-1',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 2,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.haulageDetail[0]
    expect(row?.sampleStatusLabel).not.toBe(row?.sampleStatus)
    expect(row?.truckStatusLabel).not.toBe(row?.truckStatus)
    expect(row?.wrongTruckReasonLabels[0]).not.toBe(row?.wrongTruckReasons[0])
  })
})

describe('buildShiftReport — language', () => {
  it('id and en differ in labels but agree on every number/id', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const records = [
      acceptedRecord({
        id: 'T-1',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 2,
        masterData,
        fleetSetup,
        truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
      }),
    ]
    const en = buildShiftReport(baseInput({ language: 'en', piles: [pile], productionRecords: records }))
    const id = buildShiftReport(baseInput({ language: 'id', piles: [pile], productionRecords: records }))
    expect(en.ok).toBe(true)
    expect(id.ok).toBe(true)
    if (!en.ok || !id.ok) return

    expect(en.value.header.title).not.toBe(id.value.header.title)
    // BR-REPORT-001: EN title is the exact required literal; ID is a real translation, not a generic fallback.
    expect(en.value.header.title).toBe('DAILY ORE QUALITY ASSURANCE REPORT')
    expect(id.value.header.title).not.toBe('Laporan Shift')
    expect(en.value.header.date).toBe(id.value.header.date)
    expect(en.value.header.isoWeek).toEqual(id.value.header.isoWeek)
    expect(en.value.productionSummary).toEqual(id.value.productionSummary)
    expect(en.value.productionTotals).toEqual(id.value.productionTotals)

    // Sample-status / truck-status / wrong-truck-reason labels differ...
    expect(en.value.haulageDetail[0]?.sampleStatusLabel).not.toBe(id.value.haulageDetail[0]?.sampleStatusLabel)
    expect(en.value.haulageDetail[0]?.truckStatusLabel).not.toBe(id.value.haulageDetail[0]?.truckStatusLabel)
    expect(en.value.haulageDetail[0]?.wrongTruckReasonLabels).not.toEqual(id.value.haulageDetail[0]?.wrongTruckReasonLabels)
    expect(en.value.wrongTruck[0]?.reasonLabels).not.toEqual(id.value.wrongTruck[0]?.reasonLabels)

    // ...but every raw code/id/count stays identical.
    expect(en.value.haulageDetail[0]?.sampleStatus).toBe(id.value.haulageDetail[0]?.sampleStatus)
    expect(en.value.haulageDetail[0]?.truckStatus).toBe(id.value.haulageDetail[0]?.truckStatus)
    expect(en.value.haulageDetail[0]?.wrongTruckReasons).toEqual(id.value.haulageDetail[0]?.wrongTruckReasons)
    expect(en.value.haulageDetail[0]?.batchNumber).toBe(id.value.haulageDetail[0]?.batchNumber)
    expect(en.value.haulageDetail[0]?.ritNumber).toBe(id.value.haulageDetail[0]?.ritNumber)
    expect(en.value.wrongTruck[0]?.reasons).toEqual(id.value.wrongTruck[0]?.reasons)
    expect(en.value.wrongTruck).toHaveLength(id.value.wrongTruck.length)
  })
})

describe('buildShiftReport — data integrity', () => {
  it('rejects a duplicate PileId', () => {
    const result = buildShiftReport(
      baseInput({ piles: [buildFixtureSapPile('PILE-1'), buildFixtureSapPile('PILE-1')] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_DUPLICATE_PILE_ID')
  })

  it('rejects a HaulageTransaction ShiftId mismatch', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherShiftRecord = acceptedRecord({
      id: 'T-1',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [otherShiftRecord] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_HAULAGE_SHIFT_ID_MISMATCH')
  })

  it('rejects a HaulageTransaction referencing a missing Pile', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-REPORT')
    const record = acceptedRecord({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile: otherPile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const result = buildShiftReport(baseInput({ piles: [pile], productionRecords: [record] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_HAULAGE_PILE_NOT_FOUND')
  })

  it('rejects a SamplePosition ShiftId mismatch', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH')
  })

  it('rejects a SamplePosition referencing a missing Pile', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-REPORT')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: otherPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_PILE_NOT_FOUND')
  })

  it('rejects a SamplePosition Ore mismatch against the canonical Pile', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const limPile = buildFixtureLimPile('PILE-1')
    const inconsistentPosition = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 5,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [sapPile], samplePositions: [inconsistentPosition] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH')
  })
})

describe('buildShiftReport — immutability', () => {
  it('never mutates input arrays or objects', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const record = acceptedRecord({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const manpowerAssignments = [
      { personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' },
    ]

    const input = baseInput({
      piles: [pile],
      productionRecords: [record],
      samplePositions: [position],
      manpowerAssignments,
    })
    const before = structuredClone({
      piles: input.piles,
      productionRecords: input.productionRecords,
      samplePositions: input.samplePositions,
      manpowerAssignments: input.manpowerAssignments,
    })

    const result = buildShiftReport(input)
    expect(result.ok).toBe(true)

    expect(input.piles).toEqual(before.piles)
    expect(input.productionRecords).toEqual(before.productionRecords)
    expect(input.samplePositions).toEqual(before.samplePositions)
    expect(input.manpowerAssignments).toEqual(before.manpowerAssignments)
  })
})
