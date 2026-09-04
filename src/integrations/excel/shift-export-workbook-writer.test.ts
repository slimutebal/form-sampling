import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { confirmHandoverImport } from '@/application/handover/confirm-handover-import'
import { FakeHandoverImportStore } from '@/application/handover/handover-test-fixtures'
import { previewHandoverImport } from '@/application/handover/preview-handover-import'
import { buildShiftExportSnapshot, type ShiftExportInput } from '@/application/export/build-shift-export-snapshot'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { createPendingBatch } from '@/domain/batch/pending-batch'
import { parseRitNumber } from '@/domain/batch/rit-number'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import type { Pile } from '@/domain/pile/pile'
import {
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { readHandoverWorkbookFromBytes } from './handover-workbook-reader'
import { writeShiftExportWorkbookBytes } from './shift-export-workbook-writer'

const REQUIRED_SHEET_NAMES = [
  'Report',
  'Shift_Info',
  'Pile_Summary',
  'Haulage_Detail',
  'Sampling_Detail',
  'Sample_Position',
  'Pending_Sample',
  'App_Data',
]

function pendingBatchCarryOver(pile: Pile, batch: number, lastRit: number, status: 'CONTINUE' | 'HOLD'): PendingBatchCarryOver {
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

function minimalInput(overrides: Partial<ShiftExportInput> = {}): ShiftExportInput {
  const sapPile = buildFixtureSapPile('PILE-1')
  return {
    shift: buildFixtureShift('SHIFT-1'),
    piles: [sapPile],
    haulageTransactions: [],
    samplePositions: [],
    pendingBatches: [],
    applicationVersion: '9.9.9',
    clock: { now: () => new Date('2026-09-04T10:00:00.000Z') },
    masterData: buildFixtureMasterData(),
    ...overrides,
  }
}

describe('writeShiftExportWorkbookBytes', () => {
  it('writes all 8 required sheets, in the Phase 13 contract order', () => {
    const snapshotResult = buildShiftExportSnapshot(minimalInput())
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })
    expect(workbook.SheetNames).toEqual(REQUIRED_SHEET_NAMES)
  })

  it('writes exact App_Data values', () => {
    const snapshotResult = buildShiftExportSnapshot(minimalInput())
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<{ Key: string; Value: unknown }>(workbook.Sheets.App_Data)
    const appData = Object.fromEntries(rows.map((row) => [row.Key, row.Value]))
    expect(appData.FileType).toBe('FORM_SAMPLING_SHIFT')
    expect(appData.SchemaVersion).toBe(1)
    expect(appData.ApplicationVersion).toBe('9.9.9')
    expect(appData.Shift_ID).toBe('SHIFT-1')
    expect(appData.ExportTimestamp).toBe('2026-09-04T10:00:00.000Z')
  })

  it('writes stable, language-neutral headers regardless of row content', () => {
    const snapshotResult = buildShiftExportSnapshot(minimalInput())
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })

    function headerRow(sheetName: string): unknown[] {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1 })
      return rows[0] as unknown[]
    }

    expect(headerRow('Shift_Info')).toEqual(['Shift_ID', 'Date', 'Shift', 'Sector', 'Location'])
    expect(headerRow('Pending_Sample')).toEqual(['Pile_ID', 'Ore', 'Batch', 'Last_Rit', 'Status'])
    expect(headerRow('Sample_Position')).toEqual([
      'Pile_ID',
      'Ore',
      'Batch',
      'Rit_From',
      'Rit_To',
      'Status',
      'Total_Bag',
      'Destination',
      'Dispatcher_Employee_ID',
    ])
    expect(headerRow('App_Data')).toEqual(['Key', 'Value'])
  })

  it('allows empty Haulage_Detail while still writing its header row', () => {
    const snapshotResult = buildShiftExportSnapshot(minimalInput({ haulageTransactions: [] }))
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Haulage_Detail)
    expect(rows).toEqual([])
    const headerRow = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Haulage_Detail, { header: 1 })[0]
    expect(headerRow).toContain('Truck_ID')
  })

  it('allows empty Sample_Position while still writing its header row', () => {
    const snapshotResult = buildShiftExportSnapshot(minimalInput({ samplePositions: [] }))
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sample_Position)
    expect(rows).toEqual([])
  })

  it('preserves a fractional Total Bag (0.5) as a numeric cell', () => {
    const masterData = buildFixtureMasterData()
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
    const snapshotResult = buildShiftExportSnapshot(
      minimalInput({ piles: [limPile], samplePositions: [position] }),
    )
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<{ Total_Bag: number }>(workbook.Sheets.Sample_Position)
    expect(rows[0].Total_Bag).toBe(0.5)
  })

  it('populates the Phase 14 Report sheet with header, sections and haulage rows', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })

    const snapshotResult = buildShiftExportSnapshot(
      minimalInput({ piles: [pile], haulageTransactions: [transaction], masterData, reportLanguage: 'en' }),
    )
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Report, { header: 1 })
    const flat = rows.map((row) => row.join('|'))

    expect(rows[0]?.[0]).toBe('DAILY ORE QUALITY ASSURANCE REPORT')
    expect(flat).toEqual(expect.arrayContaining([expect.stringContaining('Production Summary')]))
    expect(flat).toEqual(expect.arrayContaining([expect.stringContaining('Haulage Detail')]))
    expect(flat.some((line) => line.includes('PILE-1') && line.includes('SAP'))).toBe(true)
  })

  it('never exposes raw sample/truck-status/reason codes as Report sheet display text, only localized labels', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const validTransaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const wrongTruckTransaction = buildFixtureHaulageTransaction({
      id: 'T-2',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      rit: 4,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })

    const snapshotResult = buildShiftExportSnapshot(
      minimalInput({
        piles: [pile],
        haulageTransactions: [validTransaction, wrongTruckTransaction],
        masterData,
        reportLanguage: 'en',
      }),
    )
    expect(snapshotResult.ok).toBe(true)
    if (!snapshotResult.ok) return
    const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
    const workbook = XLSX.read(bytes, { type: 'array' })

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Report, { header: 1 })
    const cells = rows.flat()

    // Raw domain codes must never appear as their own cell value...
    expect(cells).not.toContain('REQUIRED')
    expect(cells).not.toContain('NOT_REQUIRED')
    expect(cells).not.toContain('VALID')
    expect(cells).not.toContain('WRONG_TRUCK')
    expect(cells).not.toContain('NOT_IN_EFFECTIVE_FLEET')
    expect(cells).not.toContain('HAULER_MISMATCH')

    // ...only their localized English display labels do.
    expect(cells).toContain('Required')
    expect(cells).toContain('Valid')
    expect(cells).toContain('Wrong Truck')
    expect(cells).toContain('Not In Effective Fleet')
  })

  describe('Phase 12 round-trip (Export -> Import)', () => {
    it('round-trips Shift identity, multiple pending batches, CONTINUE/HOLD, and pending Sample_Position rows; DELIVERED never becomes pending; no haulage leaks into carry-over', async () => {
      const masterData = buildFixtureMasterData()
      const fleetSetup = buildFixtureFleetSetup(masterData)
      const shift = buildFixtureShift('SHIFT-A')
      const sapPile = buildFixtureSapPile('PILE-SAP')
      const limPile = buildFixtureLimPile('PILE-LIM')

      const pendingBatches: PendingBatchCarryOver[] = [
        pendingBatchCarryOver(sapPile, 24, 10, 'CONTINUE'),
        pendingBatchCarryOver(sapPile, 25, 4, 'HOLD'),
        pendingBatchCarryOver(limPile, 3, 15, 'CONTINUE'),
      ]

      const notPickedUp = buildFixtureSamplePosition({
        id: 'SP-NOT-PICKED-UP',
        shiftId: 'SHIFT-A',
        pile: sapPile,
        batch: 24,
        ritFrom: 2,
        ritTo: 10,
        masterData,
        delivery: createNotPickedUpDelivery(),
      })
      const destination = parseDeliveryDestinationCode('LAB-1')
      if (!destination.ok) throw new Error('bad fixture')
      const delivered = buildFixtureSamplePosition({
        id: 'SP-DELIVERED',
        shiftId: 'SHIFT-A',
        pile: limPile,
        batch: 3,
        ritFrom: 5,
        ritTo: 15,
        masterData,
        delivery: createDeliveredDelivery(destination.value),
      })

      const haulageTransactions = [
        buildFixtureHaulageTransaction({
          id: 'T-1',
          shiftId: 'SHIFT-A',
          pile: sapPile,
          batch: 24,
          rit: 11,
          masterData,
          fleetSetup,
        }),
      ]

      const snapshotResult = buildShiftExportSnapshot({
        shift,
        piles: [sapPile, limPile],
        haulageTransactions,
        samplePositions: [notPickedUp, delivered],
        pendingBatches,
        applicationVersion: '1.0.0',
        clock: { now: () => new Date('2026-09-04T22:00:00.000Z') },
        masterData,
      })
      expect(snapshotResult.ok).toBe(true)
      if (!snapshotResult.ok) return

      const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)

      const rawResult = readHandoverWorkbookFromBytes(bytes)
      expect(rawResult.ok).toBe(true)
      if (!rawResult.ok) return

      const preview = await previewHandoverImport({
        raw: rawResult.value,
        fingerprint: 'fingerprint-1',
        expectedPreviousShift: { date: shift.date, shiftCode: shift.shiftCode },
        store: new FakeHandoverImportStore(),
      })
      expect(preview.ok).toBe(true)
      if (!preview.ok) return
      expect(preview.value.relationshipCheck.matches).toBe(true)

      const confirmed = confirmHandoverImport({ preview: preview.value })
      expect(confirmed.ok).toBe(true)
      if (!confirmed.ok) return

      // Source Shift identity survives.
      expect(confirmed.value.sourceShiftId).toBe(shift.id)

      // Multiple pending batches per Pile, CONTINUE and HOLD, numeric identity preserved.
      expect(confirmed.value.pendingBatches).toHaveLength(3)
      const sapContinue = confirmed.value.pendingBatches.find(
        (row) => row.pile.id === sapPile.id && row.pendingBatch.status === 'CONTINUE',
      )
      const sapHold = confirmed.value.pendingBatches.find(
        (row) => row.pile.id === sapPile.id && row.pendingBatch.status === 'HOLD',
      )
      const limContinue = confirmed.value.pendingBatches.find((row) => row.pile.id === limPile.id)
      expect(Number(sapContinue?.pendingBatch.batchNumber)).toBe(24)
      expect(Number(sapContinue?.pendingBatch.lastRit)).toBe(10)
      expect(Number(sapHold?.pendingBatch.batchNumber)).toBe(25)
      expect(Number(sapHold?.pendingBatch.lastRit)).toBe(4)
      expect(Number(limContinue?.pendingBatch.batchNumber)).toBe(3)
      expect(limContinue?.pile.oreCode).toBe('LIM')

      // NOT_PICKED_UP Sample_Position becomes a pending sample; DELIVERED does not.
      expect(confirmed.value.pendingSamples).toHaveLength(1)
      expect(confirmed.value.pendingSamples[0].pileId).toBe(sapPile.id)
      expect(Number(confirmed.value.pendingSamples[0].ritFrom)).toBe(2)
      expect(Number(confirmed.value.pendingSamples[0].ritTo)).toBe(10)

      // No previous haulage leaks into current-shift carry-over: the
      // reconstructed carry-over state has no haulage field at all.
      expect(Object.keys(confirmed.value).sort()).toEqual(
        ['fingerprint', 'pendingBatches', 'pendingSamples', 'schemaVersion', 'sourceShiftId'].sort(),
      )
    })

    it('round-trips a shift with no pending work at all', async () => {
      const shift = buildFixtureShift('SHIFT-EMPTY')
      const sapPile = buildFixtureSapPile('PILE-1')

      const snapshotResult = buildShiftExportSnapshot({
        shift,
        piles: [sapPile],
        haulageTransactions: [],
        samplePositions: [],
        pendingBatches: [],
        applicationVersion: '1.0.0',
        clock: { now: () => new Date('2026-09-04T00:00:00.000Z') },
        masterData: buildFixtureMasterData(),
      })
      expect(snapshotResult.ok).toBe(true)
      if (!snapshotResult.ok) return

      const bytes = writeShiftExportWorkbookBytes(snapshotResult.value)
      const rawResult = readHandoverWorkbookFromBytes(bytes)
      expect(rawResult.ok).toBe(true)
      if (!rawResult.ok) return

      const preview = await previewHandoverImport({
        raw: rawResult.value,
        fingerprint: 'fingerprint-empty',
        expectedPreviousShift: { date: shift.date, shiftCode: shift.shiftCode },
        store: new FakeHandoverImportStore(),
      })
      expect(preview.ok).toBe(true)
      if (!preview.ok) return

      const confirmed = confirmHandoverImport({ preview: preview.value })
      expect(confirmed.ok).toBe(true)
      if (!confirmed.ok) return
      expect(confirmed.value.pendingBatches).toEqual([])
      expect(confirmed.value.pendingSamples).toEqual([])
    })
  })
})
