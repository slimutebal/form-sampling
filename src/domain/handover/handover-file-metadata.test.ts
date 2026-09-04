import { describe, expect, it } from 'vitest'
import { parseHandoverFileMetadata } from './handover-file-metadata'

describe('parseHandoverFileMetadata', () => {
  it('accepts a valid App_Data payload', () => {
    const result = parseHandoverFileMetadata({
      FileType: 'FORM_SAMPLING_SHIFT',
      SchemaVersion: 1,
      Shift_ID: 'SHIFT-PREV-1',
      ExportTimestamp: '2026-09-03T22:41:00Z',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fileType).toBe('FORM_SAMPLING_SHIFT')
    expect(result.value.schemaVersion).toBe(1)
    expect(result.value.shiftId).toBe('SHIFT-PREV-1')
    expect(result.value.exportTimestamp).toBe('2026-09-03T22:41:00Z')
  })

  it('rejects a missing/unrecognized FileType', () => {
    const result = parseHandoverFileMetadata({ FileType: 'SOME_OTHER_APP', SchemaVersion: 1, Shift_ID: 'S1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNRECOGNIZED_FILE_TYPE')
  })

  it('rejects a missing FileType entirely', () => {
    const result = parseHandoverFileMetadata({ SchemaVersion: 1, Shift_ID: 'S1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNRECOGNIZED_FILE_TYPE')
  })

  it('rejects an unsupported SchemaVersion', () => {
    const result = parseHandoverFileMetadata({ FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 99, Shift_ID: 'S1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNSUPPORTED_SCHEMA_VERSION')
  })

  it('rejects a missing SchemaVersion', () => {
    const result = parseHandoverFileMetadata({ FileType: 'FORM_SAMPLING_SHIFT', Shift_ID: 'S1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MISSING_SCHEMA_VERSION')
  })

  it('rejects a blank Shift_ID', () => {
    const result = parseHandoverFileMetadata({ FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 1, Shift_ID: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SHIFT_ID')
  })

  it('treats a blank ExportTimestamp as absent rather than an empty string', () => {
    const result = parseHandoverFileMetadata({
      FileType: 'FORM_SAMPLING_SHIFT',
      SchemaVersion: 1,
      Shift_ID: 'S1',
      ExportTimestamp: '',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.exportTimestamp).toBeUndefined()
  })
})
