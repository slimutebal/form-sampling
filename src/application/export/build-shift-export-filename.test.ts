import { describe, expect, it } from 'vitest'
import { buildShiftExportFilename } from './build-shift-export-filename'

describe('buildShiftExportFilename', () => {
  it('is deterministic for the same ShiftId and timestamp', () => {
    const timestamp = new Date('2026-09-04T12:34:56.789Z')
    const first = buildShiftExportFilename('SHIFT-1', timestamp)
    const second = buildShiftExportFilename('SHIFT-1', timestamp)
    expect(first).toBe(second)
    expect(first).toBe('FormSampling_Shift_SHIFT-1_2026-09-04T12-34-56-789Z.xlsx')
  })

  it('sanitizes filesystem-unsafe characters in the ShiftId', () => {
    const timestamp = new Date('2026-09-04T00:00:00.000Z')
    const filename = buildShiftExportFilename('SHIFT/1:BAD*NAME', timestamp)
    expect(filename).toBe('FormSampling_Shift_SHIFT_1_BAD_NAME_2026-09-04T00-00-00-000Z.xlsx')
  })

  it('produces different filenames for different timestamps', () => {
    const a = buildShiftExportFilename('SHIFT-1', new Date('2026-09-04T00:00:00.000Z'))
    const b = buildShiftExportFilename('SHIFT-1', new Date('2026-09-04T00:00:01.000Z'))
    expect(a).not.toBe(b)
  })
})
