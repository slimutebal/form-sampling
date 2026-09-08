import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/common/clock'
import { buildShiftExportSnapshot, EXPORT_SCHEMA_VERSION, type ShiftExportInput } from '@/application/export/build-shift-export-snapshot'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { createPendingBatch } from '@/domain/batch/pending-batch'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { Pile } from '@/domain/pile/pile'
import { applySwitchPosition, applyVoidRecord } from '@/domain/production/production-correction'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixturePosition,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const FIXED_NOW = new Date('2026-09-04T12:00:00.000Z')
const FIXED_CLOCK: Clock = { now: () => FIXED_NOW }
const CORRECTED_AT = new Date('2026-09-04T13:00:00.000Z')
const CORRECTED_BY = fixtureEmployeeId('12345')

function mustCorrectionId(value: string) {
  const result = parseProductionCorrectionId(value)
  if (!result.ok) throw new Error('bad fixture')
  return result.value
}

function acceptedRecordFrom(transaction: HaulageTransaction): ProductionRecord {
  return buildFixtureProductionRecord({ transaction })
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

function baseInput(overrides: Partial<ShiftExportInput> = {}): ShiftExportInput {
  const shift = buildFixtureShift('SHIFT-1')
  const sapPile = buildFixtureSapPile('PILE-1')

  return {
    shift,
    piles: [sapPile],
    productionRecords: [],
    samplePositions: [],
    pendingBatches: [],
    applicationVersion: '1.2.3',
    clock: FIXED_CLOCK,
    masterData: buildFixtureMasterData(),
    ...overrides,
  }
}

describe('buildShiftExportSnapshot', () => {
  it('emits exact App_Data values, SchemaVersion 2 (Phase 22)', () => {
    const result = buildShiftExportSnapshot(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const appData = Object.fromEntries(result.value.appData.map((row) => [row.Key, row.Value]))
    expect(appData.FileType).toBe('FORM_SAMPLING_SHIFT')
    expect(appData.SchemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(appData.SchemaVersion).toBe(2)
    expect(appData.ApplicationVersion).toBe('1.2.3')
    expect(appData.Shift_ID).toBe('SHIFT-1')
    expect(appData.ExportTimestamp).toBe('2026-09-04T12:00:00.000Z')
  })

  it('emits Phase 12 import-compatible Shift_Info identity', () => {
    const result = buildShiftExportSnapshot(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftInfo).toEqual({
      Shift_ID: 'SHIFT-1',
      Date: '2026-09-04',
      Shift: 'D',
      Sector: 'S1',
      Location: 'HOUSE-1',
    })
  })

  it('allows empty production records', () => {
    const result = buildShiftExportSnapshot(baseInput({ productionRecords: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail).toEqual([])
    expect(result.value.samplingDetail).toEqual([])
    expect(result.value.productionCorrection).toEqual([])
  })

  it('allows empty sample positions', () => {
    const result = buildShiftExportSnapshot(baseInput({ samplePositions: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplePosition).toEqual([])
  })

  it('allows no pending work', () => {
    const result = buildShiftExportSnapshot(baseInput({ pendingBatches: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSample).toEqual([])
  })

  it('exports SAP and LIM haulage/sample records correctly', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const sapPile = buildFixtureSapPile('PILE-SAP')
    const limPile = buildFixtureLimPile('PILE-LIM')

    const sapTransaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile: sapPile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const limTransaction = buildFixtureHaulageTransaction({
      id: 'T-2',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      rit: 5,
      masterData,
      fleetSetup,
    })

    const result = buildShiftExportSnapshot(
      baseInput({
        piles: [sapPile, limPile],
        productionRecords: [acceptedRecordFrom(sapTransaction), acceptedRecordFrom(limTransaction)],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sapRow = result.value.haulageDetail.find((row) => row.Pile_ID === 'PILE-SAP')
    const limRow = result.value.haulageDetail.find((row) => row.Pile_ID === 'PILE-LIM')
    expect(sapRow?.Sample_Required_Effective).toBe('TRUE')
    expect(limRow?.Sample_Required_Effective).toBe('TRUE')
    expect(result.value.samplingDetail).toHaveLength(2)
    expect(result.value.pileSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Pile_ID: 'PILE-SAP', Ore: 'SAP', Haulage_Transaction_Count: 1 }),
        expect.objectContaining({ Pile_ID: 'PILE-LIM', Ore: 'LIM', Haulage_Transaction_Count: 1 }),
      ]),
    )
  })

  it('preserves fractional Total Bag (LIM 0.5) on Sample_Position', () => {
    const masterData = buildFixtureMasterData()
    const limPile = buildFixtureLimPile('PILE-LIM')
    // LIM: interval 5, packing 10 -> 0.5 bag per sampled Rit; ritFrom=1..ritTo=5 -> 1 sampled rit -> 0.5
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

    const result = buildShiftExportSnapshot(
      baseInput({ piles: [limPile], samplePositions: [position] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplePosition[0].Total_Bag).toBe(0.5)
  })

  it('preserves multiple pending batches per Pile with distinct numeric identity', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const rowA = pendingBatchCarryOverSimple(sapPile, 24, 10, 'CONTINUE')
    const rowB = pendingBatchCarryOverSimple(sapPile, 25, 4, 'HOLD')

    const result = buildShiftExportSnapshot(
      baseInput({ piles: [sapPile], pendingBatches: [rowA, rowB] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSample).toHaveLength(2)
    expect(result.value.pendingSample).toEqual(
      expect.arrayContaining([
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 25, Last_Rit: 4, Status: 'HOLD' },
      ]),
    )
  })

  it('rejects a HaulageTransaction with a mismatched ShiftId', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const sapPile = buildFixtureSapPile('PILE-1')
    const otherShiftTransaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-OTHER',
      pile: sapPile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })

    const result = buildShiftExportSnapshot(
      baseInput({ piles: [sapPile], productionRecords: [acceptedRecordFrom(otherShiftTransaction)] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_HAULAGE_SHIFT_ID_MISMATCH')
  })

  it('rejects a SamplePosition with a mismatched ShiftId', () => {
    const masterData = buildFixtureMasterData()
    const sapPile = buildFixtureSapPile('PILE-1')
    const otherShiftPosition = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-OTHER',
      pile: sapPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    const result = buildShiftExportSnapshot(
      baseInput({ piles: [sapPile], samplePositions: [otherShiftPosition] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH')
  })

  it('rejects a duplicate pending batch with the same Pile + Batch identity', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const rowA = pendingBatchCarryOverSimple(sapPile, 24, 10, 'CONTINUE')
    const rowB = pendingBatchCarryOverSimple(sapPile, 24, 12, 'HOLD')

    const result = buildShiftExportSnapshot(baseInput({ piles: [sapPile], pendingBatches: [rowA, rowB] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_DUPLICATE_PENDING_BATCH')
  })

  it('accepts the same Pile with different Batch numbers (no false-positive duplicate)', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const rowA = pendingBatchCarryOverSimple(sapPile, 24, 10, 'CONTINUE')
    const rowB = pendingBatchCarryOverSimple(sapPile, 25, 4, 'HOLD')

    const result = buildShiftExportSnapshot(baseInput({ piles: [sapPile], pendingBatches: [rowA, rowB] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSample).toHaveLength(2)
  })

  it('rejects a pending batch referencing a Pile missing from the export input', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-SHIFT')
    const row = pendingBatchCarryOverSimple(otherPile, 1, 1, 'CONTINUE')

    const result = buildShiftExportSnapshot(baseInput({ piles: [sapPile], pendingBatches: [row] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_PENDING_BATCH_PILE_NOT_FOUND')
  })

  it('rejects an inconsistent Pile/Ore export input (SamplePosition Ore disagrees with canonical Pile)', () => {
    const masterData = buildFixtureMasterData()
    const sapPile = buildFixtureSapPile('PILE-1')
    const limPile = buildFixtureLimPile('PILE-1')
    // A SamplePosition built against a LIM-shaped Pile sharing the same PileId as our canonical SAP pile.
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

    const result = buildShiftExportSnapshot(
      baseInput({ piles: [sapPile], samplePositions: [inconsistentPosition] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH')
  })

  it('includes a Phase 14 report DTO, defaulting to Indonesian', () => {
    const result = buildShiftExportSnapshot(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.report.language).toBe('id')
    expect(result.value.report.header.date).toBe('2026-09-04')
    expect(result.value.report.productionSummary).toEqual([])
  })

  it('honors an explicit reportLanguage and manpowerAssignments', () => {
    const result = buildShiftExportSnapshot(
      baseInput({
        reportLanguage: 'en',
        manpowerAssignments: [{ personId: fixtureEmployeeId('12345'), name: 'John Doe', jobDeskCode: 'FOREMAN' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.report.language).toBe('en')
    expect(result.value.report.manpower).toHaveLength(1)
    expect(result.value.report.manpower[0]?.employeeName).toBe('John Doe')
  })

  it('does not mutate any input array or object', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const sapPile = buildFixtureSapPile('PILE-1')
    const record = acceptedRecordFrom(
      buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile: sapPile, batch: 1, rit: 2, masterData, fleetSetup }),
    )
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: sapPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createDeliveredDelivery(
        (() => {
          const parsed = parseDeliveryDestinationCode('LAB-1')
          if (!parsed.ok) throw new Error('bad fixture')
          return parsed.value
        })(),
      ),
    })
    const row = pendingBatchCarryOverSimple(sapPile, 1, 1, 'CONTINUE')

    const input = baseInput({
      piles: [sapPile],
      productionRecords: [record],
      samplePositions: [position],
      pendingBatches: [row],
    })
    const before = structuredClone({
      piles: input.piles,
      productionRecords: input.productionRecords,
      samplePositions: input.samplePositions,
      pendingBatches: input.pendingBatches,
    })

    const result = buildShiftExportSnapshot(input)
    expect(result.ok).toBe(true)

    expect(input.piles).toEqual(before.piles)
    expect(input.productionRecords).toEqual(before.productionRecords)
    expect(input.samplePositions).toEqual(before.samplePositions)
    expect(input.pendingBatches).toEqual(before.pendingBatches)
  })
})

describe('buildShiftExportSnapshot — Phase 22 machine Haulage_Detail archive', () => {
  it('exports Original and Effective Batch/Rit both, unchanged when uncorrected', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const record = acceptedRecordFrom(transaction)

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [record] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.haulageDetail[0]
    expect(row).toMatchObject({
      Transaction_ID: 'T-1',
      Original_Batch: 1,
      Original_Rit: 2,
      Effective_Batch: 1,
      Effective_Rit: 2,
      Disposition: 'ACCEPT',
      Record_Status: 'ACTIVE',
      Physical_Condition: 'DRY',
      Contamination: 'CLN',
      Correction_Count: 0,
    })
  })

  it('preserves the immutable Original position after a SWITCH_POSITION correction, while Effective moves', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const moved = switchedRecord(acceptedRecordFrom(transaction), 3, 4)

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.haulageDetail[0]
    expect(row?.Original_Batch).toBe(1)
    expect(row?.Original_Rit).toBe(1)
    expect(row?.Effective_Batch).toBe(3)
    expect(row?.Effective_Rit).toBe(4)
    expect(row?.Correction_Count).toBe(1)
  })

  it('preserves a VOIDED record in the machine archive, with Record_Status VOIDED', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const voided = voidedRecord(acceptedRecordFrom(transaction))

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [voided] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail).toHaveLength(1)
    expect(result.value.haulageDetail[0]?.Record_Status).toBe('VOIDED')
    // VOIDED never contributes to production totals even though it's archived.
    expect(result.value.report.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
  })

  it('preserves a REJECT record in the machine archive, with Disposition REJECT', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
    const rejected = buildFixtureProductionRecord({ transaction, disposition: 'REJECT', remark: 'contaminated' })

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [rejected] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail).toHaveLength(1)
    expect(result.value.haulageDetail[0]?.Disposition).toBe('REJECT')
    expect(result.value.haulageDetail[0]?.Remark).toBe('contaminated')
  })

  it('exports Created/Updated audit metadata, Updated_At/By only populated after a correction', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const record = buildFixtureProductionRecord({ transaction, createdAt: new Date('2026-09-04T09:00:00.000Z'), createdBy: '12345' })

    const uncorrected = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [record] }))
    expect(uncorrected.ok).toBe(true)
    if (!uncorrected.ok) return
    expect(uncorrected.value.haulageDetail[0]?.Created_At).toBe('2026-09-04T09:00:00.000Z')
    expect(uncorrected.value.haulageDetail[0]?.Created_By).toBe('12345')
    expect(uncorrected.value.haulageDetail[0]?.Updated_At).toBe('')
    expect(uncorrected.value.haulageDetail[0]?.Updated_By).toBe('')

    const moved = switchedRecord(record, 1, 2)
    const corrected = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(corrected.ok).toBe(true)
    if (!corrected.ok) return
    expect(corrected.value.haulageDetail[0]?.Updated_At).toBe(CORRECTED_AT.toISOString())
    expect(corrected.value.haulageDetail[0]?.Updated_By).toBe('12345')
  })

  it('machine enum values are stable, language-neutral codes, never localized labels', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const record = acceptedRecordFrom(transaction)

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [record], reportLanguage: 'id' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.haulageDetail[0]
    expect(row?.Disposition).toBe('ACCEPT')
    expect(row?.Record_Status).toBe('ACTIVE')
    expect(row?.Truck_Status_Original).toBe('VALID')
    expect(row?.Truck_Status_Effective).toBe('VALID')
    expect(['TRUE', 'FALSE']).toContain(row?.Sample_Required_Original)
    expect(['TRUE', 'FALSE']).toContain(row?.Sample_Required_Effective)
  })
})

describe('buildShiftExportSnapshot — Phase 22 Production_Correction archive', () => {
  it('flattens correction events with Before/After Batch/Rit/Front/Truck/condition/contamination/disposition/status', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const moved = switchedRecord(acceptedRecordFrom(transaction), 2, 3)

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [moved] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionCorrection).toHaveLength(1)
    const row = result.value.productionCorrection[0]
    expect(row).toMatchObject({
      Transaction_ID: 'T-1',
      Correction_Type: 'SWITCH_POSITION',
      Before_Batch: 1,
      Before_Rit: 1,
      After_Batch: 2,
      After_Rit: 3,
      Before_Disposition: 'ACCEPT',
      After_Disposition: 'ACCEPT',
      Before_Status: 'ACTIVE',
      After_Status: 'ACTIVE',
    })
  })

  it('a record with no corrections contributes no rows', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [acceptedRecordFrom(transaction)] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionCorrection).toEqual([])
  })

  it('a VOID_RECORD correction is exported with Before_Status ACTIVE / After_Status VOIDED', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })
    const voided = voidedRecord(acceptedRecordFrom(transaction))

    const result = buildShiftExportSnapshot(baseInput({ piles: [pile], productionRecords: [voided] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionCorrection).toHaveLength(1)
    expect(result.value.productionCorrection[0]).toMatchObject({
      Correction_Type: 'VOID_RECORD',
      Before_Status: 'ACTIVE',
      After_Status: 'VOIDED',
    })
  })
})

function pendingBatchCarryOverSimple(
  pile: Pile,
  batch: number,
  lastRit: number,
  status: 'CONTINUE' | 'HOLD',
): PendingBatchCarryOver {
  const batchNumberResult = parseBatchNumber(batch)
  const ritResult = parseRitNumber(lastRit)
  if (!batchNumberResult.ok || !ritResult.ok) {
    throw new Error('bad fixture')
  }
  return {
    pile,
    pendingBatch: createPendingBatch({
      pileId: pile.id,
      batchNumber: batchNumberResult.value,
      lastRit: ritResult.value,
      status,
    }),
  }
}
