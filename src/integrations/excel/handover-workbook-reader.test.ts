import { describe, expect, it } from 'vitest'
import { buildHandoverWorkbookBytes } from './handover-test-workbook'
import { readHandoverWorkbookFromBytes } from './handover-workbook-reader'

const VALID_APP_DATA = {
  FileType: 'FORM_SAMPLING_SHIFT',
  SchemaVersion: 1,
  Shift_ID: 'SHIFT-PREV-1',
}
const VALID_SHIFT_INFO = {
  Shift_ID: 'SHIFT-PREV-1',
  Date: '2026-09-03',
  Shift: 'D',
  Sector: 'BR1',
  Location: 'HOUSE-1',
}

describe('readHandoverWorkbookFromBytes', () => {
  it('reads a valid archive into raw per-sheet rows', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      pendingSample: [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      ],
      samplePosition: [
        {
          Pile_ID: 'PILE-1',
          Ore: 'SAP',
          Batch: 24,
          Rit_From: 2,
          Rit_To: 10,
          Status: 'NOT_PICKED_UP',
        },
      ],
    })

    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.appData.FileType).toBe('FORM_SAMPLING_SHIFT')
    expect(result.value.appData.SchemaVersion).toBe(1)
    expect(result.value.shiftInfo?.Shift_ID).toBe('SHIFT-PREV-1')
    expect(result.value.pendingSample).toHaveLength(1)
    expect(result.value.samplePosition).toHaveLength(1)
  })

  it('rejects a file that is not a recognized handover archive (not an Excel file / wrong sheets)', () => {
    // SheetJS parses arbitrary bytes leniently (falling back to a single
    // "Sheet1" rather than throwing), so a non-Excel file surfaces here
    // as a missing required sheet rather than a parse exception — the
    // UNREADABLE_FILE branch guards a genuine SheetJS parse failure
    // (e.g. a corrupt compressed archive), which this input does not
    // reliably trigger.
    const bytes = new TextEncoder().encode('this is not an excel file at all').buffer
    const result = readHandoverWorkbookFromBytes(bytes as ArrayBuffer)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_SHEET')
  })

  it('rejects a workbook missing a required sheet', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      sheetNames: ['App_Data', 'Shift_Info', 'Pending_Sample'],
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_SHEET')
  })

  it('never reads or exposes Haulage_Detail rows (rule 2: previous-shift haulage must not become current-shift transactions)', () => {
    // Even if the archive contains a Haulage_Detail sheet (ARCHITECTURE.md
    // §9.2), the raw result has no field capable of carrying it —
    // RawHandoverWorkbook only exposes appData/shiftInfo/pendingSample/
    // samplePosition. This directly exercises that a workbook built with
    // an extra Haulage_Detail sheet still parses successfully and yields
    // no haulage-shaped output at all.
    const workbookWithHaulageDetail = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      extraSheets: {
        Haulage_Detail: [
          {
            Transaction_ID: 'HLG-1',
            Shift_ID: 'SHIFT-PREV-1',
            Pile_ID: 'PILE-1',
            Batch: 24,
            Rit: 5,
            Truck_ID: 'DT-1',
          },
        ],
      },
    })
    const result = readHandoverWorkbookFromBytes(workbookWithHaulageDetail)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value)).toEqual([
      'appData',
      'shiftInfo',
      'pendingSample',
      'samplePosition',
    ])
  })

  it('returns an empty pendingSample/samplePosition array when there is no pending work', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSample).toEqual([])
    expect(result.value.samplePosition).toEqual([])
  })

  it('accepts an empty Pending_Sample sheet that still carries the correct header row', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      pendingSample: [],
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSample).toEqual([])
  })

  it('rejects an empty Pending_Sample sheet missing a required header column', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      pendingSample: [],
      headers: { Pending_Sample: ['Pile_ID', 'Ore', 'Batch', 'Last_Rit'] },
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_COLUMN')
  })

  it('accepts an empty Sample_Position sheet that still carries the correct header row', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      samplePosition: [],
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplePosition).toEqual([])
  })

  it('rejects a workbook missing a required column in App_Data', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      headers: { App_Data: ['Key'] },
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_COLUMN')
  })

  it('rejects a workbook missing a required column in Shift_Info', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      headers: { Shift_Info: ['Shift_ID', 'Date', 'Shift', 'Sector'] },
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_COLUMN')
  })

  it('rejects a workbook missing a required column in Pending_Sample', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      pendingSample: [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      ],
      headers: { Pending_Sample: ['Pile_ID', 'Ore', 'Batch', 'Last_Rit'] },
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_COLUMN')
  })

  it('rejects a workbook missing a required column in Sample_Position', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      samplePosition: [
        {
          Pile_ID: 'PILE-1',
          Ore: 'SAP',
          Batch: 24,
          Rit_From: 2,
          Rit_To: 10,
          Status: 'NOT_PICKED_UP',
        },
      ],
      headers: { Sample_Position: ['Pile_ID', 'Ore', 'Batch', 'Rit_From', 'Rit_To'] },
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_COLUMN')
  })

  it('rejects a workbook with more than one Shift_Info data row, never silently using only the first', () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: [VALID_SHIFT_INFO, { ...VALID_SHIFT_INFO, Shift_ID: 'SHIFT-PREV-2' }],
    })
    const result = readHandoverWorkbookFromBytes(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MULTIPLE_SHIFT_INFO_ROWS')
  })
})
