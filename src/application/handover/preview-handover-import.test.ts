import { describe, expect, it } from 'vitest'
import { parseShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import { baseHandoverWorkbook, FakeHandoverImportStore } from './handover-test-fixtures'
import { previewHandoverImport } from './preview-handover-import'

function expectedPreviousShift(date: string, shiftCode: string): ExpectedPreviousShift {
  const dateResult = parseShiftDate(date)
  const shiftCodeResult = parseShiftCode(shiftCode)
  if (!dateResult.ok || !shiftCodeResult.ok) throw new Error('invalid test fixture')
  return { date: dateResult.value, shiftCode: shiftCodeResult.value }
}

describe('previewHandoverImport', () => {
  it('produces a preview with active (CONTINUE) piles/batches and pending samples, matching relationship', async () => {
    const store = new FakeHandoverImportStore()
    const raw = baseHandoverWorkbook({
      pendingSample: [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'PILE-2', Ore: 'LIM', Batch: 7, Last_Rit: 65, Status: 'HOLD' },
      ],
      samplePosition: [{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' }],
    })

    const result = await previewHandoverImport({
      raw,
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.relationshipCheck.matches).toBe(true)
    expect(result.value.activeCarryOverPiles.map((pile) => pile.id)).toEqual(['PILE-1'])
    expect(result.value.activePendingBatches).toHaveLength(1)
    expect(result.value.pendingSamples).toHaveLength(1)
  })

  it('flags a wrong previous Date/Shift without rejecting the preview', async () => {
    const store = new FakeHandoverImportStore()
    const result = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-01', 'N'),
      store,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.relationshipCheck.matches).toBe(false)
  })

  it('reports no pending work for an archive with no Pending_Sample/Sample_Position rows', async () => {
    const store = new FakeHandoverImportStore()
    const result = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.activeCarryOverPiles).toEqual([])
    expect(result.value.pendingSamples).toEqual([])
  })

  it('rejects a fingerprint that was already imported (rule 8) — early, read-only check', async () => {
    const store = new FakeHandoverImportStore()
    store.markImported('fp-1')

    const result = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_IMPORT')
  })

  it('propagates an unsupported schema version instead of producing a preview', async () => {
    const store = new FakeHandoverImportStore()
    const result = await previewHandoverImport({
      raw: baseHandoverWorkbook({ appData: { FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 99, Shift_ID: 'S1' } }),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNSUPPORTED_SCHEMA_VERSION')
  })
})
