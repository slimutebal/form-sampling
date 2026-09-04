import { describe, expect, it } from 'vitest'
import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'
import { parseHandoverArchive } from './parse-handover-archive'

const VALID_APP_DATA = { FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 1, Shift_ID: 'SHIFT-PREV-1' }
const VALID_SHIFT_INFO = { Shift_ID: 'SHIFT-PREV-1', Date: '2026-09-03', Shift: 'D', Sector: 'BR1', Location: 'HOUSE-1' }

function baseWorkbook(overrides: Partial<RawHandoverWorkbook> = {}): RawHandoverWorkbook {
  return {
    appData: VALID_APP_DATA,
    shiftInfo: VALID_SHIFT_INFO,
    pendingSample: [],
    samplePosition: [],
    ...overrides,
  }
}

describe('parseHandoverArchive', () => {
  it('reconstructs a full archive: multiple pending batches (BR-PEND-003) and pending samples', () => {
    const workbook = baseWorkbook({
      pendingSample: [
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 31, Last_Rit: 18, Status: 'CONTINUE' },
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 32, Last_Rit: 14, Status: 'CONTINUE' },
      ],
      samplePosition: [
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      ],
    })

    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.metadata.shiftId).toBe('SHIFT-PREV-1')
    expect(result.value.shiftInfo.shiftCode).toBe('D')
    expect(result.value.pendingBatches.map((row) => Number(row.pendingBatch.batchNumber))).toEqual([24, 25, 31, 32])
    expect(result.value.pendingSamples).toHaveLength(1)
  })

  it('rejects an unsupported schema version', () => {
    const workbook = baseWorkbook({ appData: { ...VALID_APP_DATA, SchemaVersion: 99 } })
    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNSUPPORTED_SCHEMA_VERSION')
  })

  it('rejects a missing Shift_Info row', () => {
    const workbook = baseWorkbook({ shiftInfo: undefined })
    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_SHIFT_INFO_ROW')
  })

  it('returns empty pendingBatches/pendingSamples when there is no pending work at all', () => {
    const result = parseHandoverArchive(baseWorkbook())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingBatches).toEqual([])
    expect(result.value.pendingSamples).toEqual([])
  })

  it('rejects a malformed Pile/Ore row in Pending_Sample rather than guessing', () => {
    const workbook = baseWorkbook({
      pendingSample: [{ Pile_ID: 'PILE-1', Ore: '', Batch: 1, Last_Rit: 1, Status: 'CONTINUE' }],
    })
    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MALFORMED_PILE_ORE')
  })

  it('passes when App_Data.Shift_ID and Shift_Info.Shift_ID match', () => {
    const workbook = baseWorkbook({
      appData: { ...VALID_APP_DATA, Shift_ID: 'SHIFT-PREV-1' },
      shiftInfo: { ...VALID_SHIFT_INFO, Shift_ID: 'SHIFT-PREV-1' },
    })
    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.metadata.shiftId).toBe('SHIFT-PREV-1')
    expect(result.value.shiftInfo.shiftId).toBe('SHIFT-PREV-1')
  })

  it('rejects an archive where App_Data.Shift_ID and Shift_Info.Shift_ID disagree, without normalizing either side', () => {
    const workbook = baseWorkbook({
      appData: { ...VALID_APP_DATA, Shift_ID: 'SHIFT-PREV-1' },
      shiftInfo: { ...VALID_SHIFT_INFO, Shift_ID: 'SHIFT-PREV-2' },
    })
    const result = parseHandoverArchive(workbook)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_SHIFT_ID_MISMATCH')
  })

  describe('archive-level Pile/Ore consistency', () => {
    it('1. multiple pending batches for the same Pile with the same Ore passes', () => {
      const workbook = baseWorkbook({
        pendingSample: [
          { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
          { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
        ],
      })
      const result = parseHandoverArchive(workbook)
      expect(result.ok).toBe(true)
    })

    it('2. Pending_Sample rows for the same Pile with different Ore fails', () => {
      const workbook = baseWorkbook({
        pendingSample: [
          { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
          { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
        ],
      })
      const result = parseHandoverArchive(workbook)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
    })

    it('3. Pending_Sample vs Sample_Position for the same Pile with different Ore fails', () => {
      const workbook = baseWorkbook({
        pendingSample: [{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' }],
        samplePosition: [
          { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
        ],
      })
      const result = parseHandoverArchive(workbook)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
    })

    it('4. multiple pending Sample_Position rows for the same Pile with different Ore fails', () => {
      const workbook = baseWorkbook({
        samplePosition: [
          { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
          { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 25, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
        ],
      })
      const result = parseHandoverArchive(workbook)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
    })

    it('a pending sample for a Pile with no pending batch is allowed', () => {
      const workbook = baseWorkbook({
        samplePosition: [
          { Pile_ID: 'PILE-NO-BATCH', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
        ],
      })
      const result = parseHandoverArchive(workbook)
      expect(result.ok).toBe(true)
    })
  })
})
