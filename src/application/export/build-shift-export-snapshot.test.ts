import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/common/clock'
import { buildShiftExportSnapshot, EXPORT_SCHEMA_VERSION, type ShiftExportInput } from '@/application/export/build-shift-export-snapshot'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { createPendingBatch } from '@/domain/batch/pending-batch'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { Pile } from '@/domain/pile/pile'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const FIXED_NOW = new Date('2026-09-04T12:00:00.000Z')
const FIXED_CLOCK: Clock = { now: () => FIXED_NOW }

function baseInput(overrides: Partial<ShiftExportInput> = {}): ShiftExportInput {
  const shift = buildFixtureShift('SHIFT-1')
  const sapPile = buildFixtureSapPile('PILE-1')

  return {
    shift,
    piles: [sapPile],
    haulageTransactions: [],
    samplePositions: [],
    pendingBatches: [],
    applicationVersion: '1.2.3',
    clock: FIXED_CLOCK,
    masterData: buildFixtureMasterData(),
    ...overrides,
  }
}

describe('buildShiftExportSnapshot', () => {
  it('emits exact App_Data values (rule 2)', () => {
    const result = buildShiftExportSnapshot(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const appData = Object.fromEntries(result.value.appData.map((row) => [row.Key, row.Value]))
    expect(appData.FileType).toBe('FORM_SAMPLING_SHIFT')
    expect(appData.SchemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(appData.SchemaVersion).toBe(1)
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

  it('allows empty haulage transactions', () => {
    const result = buildShiftExportSnapshot(baseInput({ haulageTransactions: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.haulageDetail).toEqual([])
    expect(result.value.samplingDetail).toEqual([])
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
        haulageTransactions: [sapTransaction, limTransaction],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sapRow = result.value.haulageDetail.find((row) => row.Pile_ID === 'PILE-SAP')
    const limRow = result.value.haulageDetail.find((row) => row.Pile_ID === 'PILE-LIM')
    expect(sapRow?.Sample_Status).toBe('REQUIRED')
    expect(limRow?.Sample_Status).toBe('REQUIRED')
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
      baseInput({ piles: [sapPile], haulageTransactions: [otherShiftTransaction] }),
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
    const transaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile: sapPile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
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
      haulageTransactions: [transaction],
      samplePositions: [position],
      pendingBatches: [row],
    })
    const before = structuredClone({
      piles: input.piles,
      haulageTransactions: input.haulageTransactions,
      samplePositions: input.samplePositions,
      pendingBatches: input.pendingBatches,
    })

    const result = buildShiftExportSnapshot(input)
    expect(result.ok).toBe(true)

    expect(input.piles).toEqual(before.piles)
    expect(input.haulageTransactions).toEqual(before.haulageTransactions)
    expect(input.samplePositions).toEqual(before.samplePositions)
    expect(input.pendingBatches).toEqual(before.pendingBatches)
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
