import { describe, expect, it } from 'vitest'
import { parseShiftId } from '../common/identifiers'
import { parsePendingBatchRows } from './carry-over-pending-batch'
import { parseSamplePositionCarryOverRows } from './carry-over-pending-sample'
import { validateArchivePileOreConsistency } from './pile-ore-consistency'

function mustSourceShiftId(value: string) {
  const result = parseShiftId(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

const sourceShiftId = mustSourceShiftId('SHIFT-PREV-1')

describe('validateArchivePileOreConsistency', () => {
  it('passes for multiple pending batches on the same Pile with the same Ore (BR-PEND-003)', () => {
    const batches = parsePendingBatchRows([
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 31, Last_Rit: 18, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 32, Last_Rit: 14, Status: 'CONTINUE' },
    ])
    if (!batches.ok) throw new Error('invalid test fixture')

    const result = validateArchivePileOreConsistency(batches.value, [])
    expect(result.ok).toBe(true)
  })

  it('rejects Pending_Sample rows for the same Pile with different Ore', () => {
    const batches = parsePendingBatchRows([
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
    ])
    if (!batches.ok) throw new Error('invalid test fixture')

    const result = validateArchivePileOreConsistency(batches.value, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
  })

  it('rejects a Pending_Sample vs Sample_Position Ore conflict for the same Pile', () => {
    const batches = parsePendingBatchRows([
      { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
    ])
    if (!batches.ok) throw new Error('invalid test fixture')

    const samples = parseSamplePositionCarryOverRows(
      [{ Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' }],
      sourceShiftId,
    )
    if (!samples.ok) throw new Error('invalid test fixture')

    const result = validateArchivePileOreConsistency(batches.value, samples.value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
  })

  it('rejects multiple pending Sample_Position rows for the same Pile with different Ore', () => {
    const samples = parseSamplePositionCarryOverRows(
      [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
        { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 25, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
      ],
      sourceShiftId,
    )
    if (!samples.ok) throw new Error('invalid test fixture')

    const result = validateArchivePileOreConsistency([], samples.value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_ORE_CONFLICT')
  })

  it('allows a pending sample for a Pile with no pending batch at all', () => {
    const samples = parseSamplePositionCarryOverRows(
      [{ Pile_ID: 'PILE-NO-BATCH', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' }],
      sourceShiftId,
    )
    if (!samples.ok) throw new Error('invalid test fixture')

    const result = validateArchivePileOreConsistency([], samples.value)
    expect(result.ok).toBe(true)
  })

  it('passes for an entirely empty archive (no pending batches, no pending samples)', () => {
    const result = validateArchivePileOreConsistency([], [])
    expect(result.ok).toBe(true)
  })
})
