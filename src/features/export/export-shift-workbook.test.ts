import { describe, expect, it } from 'vitest'
import { exportShiftWorkbook } from './export-shift-workbook'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { createPendingBatch } from '@/domain/batch/pending-batch'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { buildFixtureMasterData, buildFixtureSapPile, buildFixtureShift } from '@/test/fixtures/haulage-operation-test-fixtures'

describe('exportShiftWorkbook', () => {
  it('produces workbook bytes and a matching deterministic filename', async () => {
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')
    const fixedNow = new Date('2026-09-04T08:00:00.000Z')

    const result = await exportShiftWorkbook({
      shift,
      piles: [pile],
      productionRecords: [],
      samplePositions: [],
      pendingBatches: [],
      applicationVersion: '1.0.0-test',
      clock: { now: () => fixedNow },
      masterData: buildFixtureMasterData(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bytes.byteLength).toBeGreaterThan(0)
    expect(result.value.filename).toBe('FormSampling_Shift_SHIFT-1_2026-09-04T08-00-00-000Z.xlsx')
  })

  it('propagates a validation error from the snapshot builder instead of writing bytes', async () => {
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-SHIFT')
    const batchNumber = parseBatchNumber(1)
    const ritNumber = parseRitNumber(1)
    if (!batchNumber.ok || !ritNumber.ok) throw new Error('bad fixture')

    const result = await exportShiftWorkbook({
      shift,
      piles: [pile],
      productionRecords: [],
      samplePositions: [],
      pendingBatches: [
        {
          pile: otherPile,
          pendingBatch: createPendingBatch({
            pileId: otherPile.id,
            batchNumber: batchNumber.value,
            lastRit: ritNumber.value,
            status: 'CONTINUE',
          }),
        },
      ],
      applicationVersion: '1.0.0-test',
      clock: { now: () => new Date('2026-09-04T08:00:00.000Z') },
      masterData: buildFixtureMasterData(),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_PENDING_BATCH_PILE_NOT_FOUND')
  })

  it('converts a workbook writer failure to a stable EXPORT_WORKBOOK_WRITE_FAILED error, never a raw Error.message, and never rejects', async () => {
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const resultPromise = exportShiftWorkbook({
      shift,
      piles: [pile],
      productionRecords: [],
      samplePositions: [],
      pendingBatches: [],
      applicationVersion: '1.0.0-test',
      clock: { now: () => new Date('2026-09-04T08:00:00.000Z') },
      masterData: buildFixtureMasterData(),
      writeWorkbookBytes: () => {
        throw new Error('secret SheetJS internals, must never leak to callers')
      },
    })

    await expect(resultPromise).resolves.not.toThrow()
    const result = await resultPromise

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_WORKBOOK_WRITE_FAILED')
    expect(result.error.message).not.toContain('secret SheetJS internals')
  })

  it('rejects a duplicate pending batch (same Pile + Batch) before ever reaching the writer', async () => {
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')
    const batchNumber = parseBatchNumber(1)
    const ritA = parseRitNumber(1)
    const ritB = parseRitNumber(2)
    if (!batchNumber.ok || !ritA.ok || !ritB.ok) throw new Error('bad fixture')

    const result = await exportShiftWorkbook({
      shift,
      piles: [pile],
      productionRecords: [],
      samplePositions: [],
      pendingBatches: [
        {
          pile,
          pendingBatch: createPendingBatch({
            pileId: pile.id,
            batchNumber: batchNumber.value,
            lastRit: ritA.value,
            status: 'CONTINUE',
          }),
        },
        {
          pile,
          pendingBatch: createPendingBatch({
            pileId: pile.id,
            batchNumber: batchNumber.value,
            lastRit: ritB.value,
            status: 'HOLD',
          }),
        },
      ],
      applicationVersion: '1.0.0-test',
      clock: { now: () => new Date('2026-09-04T08:00:00.000Z') },
      masterData: buildFixtureMasterData(),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('EXPORT_DUPLICATE_PENDING_BATCH')
  })
})
