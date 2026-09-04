import { describe, expect, it } from 'vitest'
import { parseShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import { confirmHandoverImport } from './confirm-handover-import'
import { baseHandoverWorkbook, FakeHandoverImportStore } from './handover-test-fixtures'
import { previewHandoverImport } from './preview-handover-import'

function expectedPreviousShift(date: string, shiftCode: string): ExpectedPreviousShift {
  const dateResult = parseShiftDate(date)
  const shiftCodeResult = parseShiftCode(shiftCode)
  if (!dateResult.ok || !shiftCodeResult.ok) throw new Error('invalid test fixture')
  return { date: dateResult.value, shiftCode: shiftCodeResult.value }
}

describe('confirmHandoverImport — non-destructive (no I/O, no persistence)', () => {
  it('produces carry-over state for a matching preview: CONTINUE and HOLD both preserved', async () => {
    const store = new FakeHandoverImportStore()
    const raw = baseHandoverWorkbook({
      pendingSample: [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'PILE-2', Ore: 'LIM', Batch: 7, Last_Rit: 65, Status: 'HOLD' },
      ],
    })
    const preview = await previewHandoverImport({
      raw,
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })
    if (!preview.ok) throw new Error('invalid test setup')

    const result = confirmHandoverImport({ preview: preview.value })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sourceShiftId).toBe('SHIFT-PREV-1')
    expect(result.value.fingerprint).toBe('fp-1')
    expect(result.value.pendingBatches).toHaveLength(2)
    expect(result.value.pendingBatches.map((row) => row.pendingBatch.status).sort()).toEqual(['CONTINUE', 'HOLD'])
  })

  it('produces an empty carry-over state when there is no pending work', async () => {
    const store = new FakeHandoverImportStore()
    const preview = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })
    if (!preview.ok) throw new Error('invalid test setup')

    const result = confirmHandoverImport({ preview: preview.value })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingBatches).toEqual([])
    expect(result.value.pendingSamples).toEqual([])
  })

  it('mismatch cannot be bypassed: unconditionally blocks with PREVIOUS_SHIFT_MISMATCH, with no acknowledgement parameter to override it', async () => {
    const store = new FakeHandoverImportStore()
    const preview = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-01', 'N'),
      store,
    })
    if (!preview.ok) throw new Error('invalid test setup')
    expect(preview.value.relationshipCheck.matches).toBe(false)

    // ConfirmHandoverImportParams only accepts `preview` — there is no
    // acknowledgeMismatch/force/override field a caller could pass, so
    // this is the only possible call shape, and it must always block.
    const result = confirmHandoverImport({ preview: preview.value })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PREVIOUS_SHIFT_MISMATCH')
  })

  it('confirm alone does not consume the fingerprint: the store is left completely untouched by confirm', async () => {
    const store = new FakeHandoverImportStore()
    const preview = await previewHandoverImport({
      raw: baseHandoverWorkbook(),
      fingerprint: 'fp-1',
      expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
      store,
    })
    if (!preview.ok) throw new Error('invalid test setup')

    const before = await store.hasImportedFingerprint('fp-1')
    const result = confirmHandoverImport({ preview: preview.value })
    const after = await store.hasImportedFingerprint('fp-1')

    expect(result.ok).toBe(true)
    expect(before).toEqual({ ok: true, value: false })
    // Confirm performed no write: the store's state is identical before and after.
    expect(after).toEqual(before)
  })
})
