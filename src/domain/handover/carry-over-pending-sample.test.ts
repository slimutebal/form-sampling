import { describe, expect, it } from 'vitest'
import { parseShiftId } from '../common/identifiers'
import {
  parseSamplePositionCarryOverRow,
  parseSamplePositionCarryOverRows,
  type RawSamplePositionCarryOverRow,
} from './carry-over-pending-sample'

function mustSourceShiftId(value: string) {
  const result = parseShiftId(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

describe('parseSamplePositionCarryOverRow', () => {
  const sourceShiftId = mustSourceShiftId('SHIFT-PREV-1')

  it('reconstructs a NOT_PICKED_UP row as a carry-over pending sample', () => {
    const result = parseSamplePositionCarryOverRow(
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      sourceShiftId,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBeDefined()
    expect(result.value?.pileId).toBe('PILE-1')
    expect(result.value?.oreCode).toBe('SAP')
    expect(Number(result.value?.batchNumber)).toBe(24)
    expect(Number(result.value?.ritFrom)).toBe(2)
    expect(Number(result.value?.ritTo)).toBe(10)
    expect(result.value?.sourceShiftId).toBe('SHIFT-PREV-1')
  })

  it('does not carry over a DELIVERED row — it is historical reference only (rule 6)', () => {
    const result = parseSamplePositionCarryOverRow(
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'DELIVERED' },
      sourceShiftId,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBeUndefined()
  })

  it('rejects an unrecognized delivery Status', () => {
    const result = parseSamplePositionCarryOverRow(
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'UNKNOWN' },
      sourceShiftId,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SAMPLE_DELIVERY_STATUS')
  })

  it('rejects a NOT_PICKED_UP row with a blank Ore (malformed Pile/Ore rejected)', () => {
    const result = parseSamplePositionCarryOverRow(
      { Pile_ID: 'PILE-1', Ore: '', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      sourceShiftId,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MALFORMED_PILE_ORE')
  })

  it('rejects a reversed Rit range', () => {
    const result = parseSamplePositionCarryOverRow(
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 10, Rit_To: 2, Status: 'NOT_PICKED_UP' },
      sourceShiftId,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_REVERSED')
  })
})

describe('parseSamplePositionCarryOverRows', () => {
  const sourceShiftId = mustSourceShiftId('SHIFT-PREV-1')

  it('collects pending samples and drops handled (DELIVERED) rows without duplicating them', () => {
    const rows: RawSamplePositionCarryOverRow[] = [
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 12, Rit_To: 20, Status: 'DELIVERED' },
    ]
    const result = parseSamplePositionCarryOverRows(rows, sourceShiftId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(1)
    expect(Number(result.value[0].ritFrom)).toBe(2)
  })

  it('returns an empty array when there is no pending work (all handled)', () => {
    const rows: RawSamplePositionCarryOverRow[] = [
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'DELIVERED' },
    ]
    const result = parseSamplePositionCarryOverRows(rows, sourceShiftId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('fails on the first malformed row', () => {
    const rows: RawSamplePositionCarryOverRow[] = [
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      { Pile_ID: 'PILE-1', Ore: '', Batch: 24, Rit_From: 12, Rit_To: 20, Status: 'NOT_PICKED_UP' },
    ]
    const result = parseSamplePositionCarryOverRows(rows, sourceShiftId)
    expect(result.ok).toBe(false)
  })
})
