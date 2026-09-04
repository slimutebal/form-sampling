import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildHandoverWorkbookBytes } from '@/integrations/excel/handover-test-workbook'
import { readHandoverFile } from './read-handover-file'

const VALID_APP_DATA = { FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 1, Shift_ID: 'SHIFT-PREV-1' }
const VALID_SHIFT_INFO = { Shift_ID: 'SHIFT-PREV-1', Date: '2026-09-03', Shift: 'D', Sector: 'BR1', Location: 'HOUSE-1' }

describe('readHandoverFile — end-to-end through real File/SheetJS/Web Crypto', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads a real xlsx File into raw workbook rows plus a stable SHA-256 fingerprint', async () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      pendingSample: [{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' }],
    })
    const file = new File([bytes], 'previous-shift.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await readHandoverFile(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.raw.appData.FileType).toBe('FORM_SAMPLING_SHIFT')
    expect(result.value.raw.pendingSample).toHaveLength(1)
    expect(result.value.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces the same fingerprint for the same file content (duplicate-detection basis)', async () => {
    const bytes = buildHandoverWorkbookBytes({ appData: VALID_APP_DATA, shiftInfo: VALID_SHIFT_INFO })
    const fileA = new File([bytes], 'a.xlsx')
    const fileB = new File([bytes.slice(0)], 'b.xlsx')

    const resultA = await readHandoverFile(fileA)
    const resultB = await readHandoverFile(fileB)
    expect(resultA.ok && resultB.ok).toBe(true)
    if (!resultA.ok || !resultB.ok) return
    expect(resultA.value.fingerprint).toBe(resultB.value.fingerprint)
  })

  it('propagates a read failure (e.g. missing required sheet) as a stable code', async () => {
    const bytes = buildHandoverWorkbookBytes({
      appData: VALID_APP_DATA,
      shiftInfo: VALID_SHIFT_INFO,
      sheetNames: ['App_Data', 'Shift_Info'],
    })
    const file = new File([bytes], 'incomplete.xlsx')

    const result = await readHandoverFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_REQUIRED_SHEET')
  })

  it('converts a rejected file read (e.g. FileReader/File.arrayBuffer failure) into a stable Result error instead of rejecting', async () => {
    const bytes = buildHandoverWorkbookBytes({ appData: VALID_APP_DATA, shiftInfo: VALID_SHIFT_INFO })
    const file = new File([bytes], 'previous-shift.xlsx')
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: () => Promise.reject(new Error('disk read error')),
    })

    const result = await readHandoverFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FILE_READ_FAILED')
  })

  it('converts a rejected WebCrypto digest (fingerprint failure) into a stable Result error instead of rejecting', async () => {
    const bytes = buildHandoverWorkbookBytes({ appData: VALID_APP_DATA, shiftInfo: VALID_SHIFT_INFO })
    const file = new File([bytes], 'previous-shift.xlsx')
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('WebCrypto unavailable'))

    const result = await readHandoverFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FILE_READ_FAILED')
  })
})
