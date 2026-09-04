import { describe, expect, it } from 'vitest'
import {
  parsePendingBatchRow,
  parsePendingBatchRows,
  selectActiveCarryOverPiles,
  selectActiveContinuationBatches,
  type RawPendingBatchRow,
} from './carry-over-pending-batch'

describe('parsePendingBatchRow', () => {
  it('reconstructs a Pile + PendingBatch from a valid row (BR-PEND-002)', () => {
    const result = parsePendingBatchRow({ Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pile.id).toBe('L18_S09')
    expect(result.value.pile.oreCode).toBe('SAP')
    expect(Number(result.value.pendingBatch.batchNumber)).toBe(24)
    expect(Number(result.value.pendingBatch.lastRit)).toBe(10)
    expect(result.value.pendingBatch.status).toBe('CONTINUE')
  })

  it('rejects a row with a blank Ore (rule 7: malformed Pile/Ore rejected)', () => {
    const result = parsePendingBatchRow({ Pile_ID: 'L18_S09', Ore: '', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MALFORMED_PILE_ORE')
  })

  it('rejects a row missing Ore entirely', () => {
    const result = parsePendingBatchRow({ Pile_ID: 'L18_S09', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MALFORMED_PILE_ORE')
  })

  it('rejects an invalid Status', () => {
    const result = parsePendingBatchRow({ Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'MAYBE' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_PENDING_STATUS')
  })

  it('rejects a non-numeric Batch', () => {
    const result = parsePendingBatchRow({ Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 'abc', Last_Rit: 10, Status: 'CONTINUE' })
    expect(result.ok).toBe(false)
  })
})

describe('parsePendingBatchRows — a single pending batch', () => {
  it('reconstructs exactly one pending batch when the archive has only one', () => {
    const result = parsePendingBatchRows([{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(1)
    expect(Number(result.value[0].pendingBatch.batchNumber)).toBe(24)
  })
})

describe('parsePendingBatchRows — multiple pending batches per pile (BR-PEND-003/004)', () => {
  const rows: RawPendingBatchRow[] = [
    { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
    { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
    { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 31, Last_Rit: 18, Status: 'CONTINUE' },
    { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 32, Last_Rit: 14, Status: 'CONTINUE' },
  ]

  it('preserves every pending batch for the same pile, in deterministic numeric order as given', () => {
    const result = parsePendingBatchRows(rows)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((row) => Number(row.pendingBatch.batchNumber))).toEqual([24, 25, 31, 32])
    expect(result.value.every((row) => row.pile.id === 'L18_S09')).toBe(true)
  })

  it('fails on the first invalid row rather than silently dropping it', () => {
    const withInvalid: RawPendingBatchRow[] = [
      rows[0],
      { Pile_ID: 'L18_S09', Ore: '', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
    ]
    const result = parsePendingBatchRows(withInvalid)
    expect(result.ok).toBe(false)
  })
})

describe('selectActiveContinuationBatches / selectActiveCarryOverPiles (rule 4)', () => {
  it('CONTINUE rows become active carry-over', () => {
    const parsed = parsePendingBatchRows([
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
    ])
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(selectActiveContinuationBatches(parsed.value)).toHaveLength(1)
    expect(selectActiveCarryOverPiles(parsed.value).map((pile) => pile.id)).toEqual(['PILE-1'])
  })

  it('HOLD rows are excluded from active carry-over, not activated automatically', () => {
    const parsed = parsePendingBatchRows([
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'HOLD' },
    ])
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(selectActiveContinuationBatches(parsed.value)).toHaveLength(0)
    expect(selectActiveCarryOverPiles(parsed.value)).toHaveLength(0)
  })

  it('a mix of CONTINUE and HOLD only activates the CONTINUE piles', () => {
    const parsed = parsePendingBatchRows([
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      { Pile_ID: 'PILE-2', Ore: 'LIM', Batch: 7, Last_Rit: 65, Status: 'HOLD' },
    ])
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(selectActiveCarryOverPiles(parsed.value).map((pile) => pile.id)).toEqual(['PILE-1'])
  })
})
