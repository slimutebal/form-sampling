import { describe, expect, it } from 'vitest'
import { parsePendingBatchRows } from '@/domain/handover/carry-over-pending-batch'
import { groupPendingBatchesByPile } from './group-pending-batches-by-pile'

describe('groupPendingBatchesByPile', () => {
  it('groups multiple pending batches for the same pile, sorted deterministically by batch number (BR-PEND-004)', () => {
    const parsed = parsePendingBatchRows([
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 32, Last_Rit: 14, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 31, Last_Rit: 18, Status: 'CONTINUE' },
      { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
    ])
    if (!parsed.ok) throw new Error('invalid test fixture')

    const groups = groupPendingBatchesByPile(parsed.value)
    expect(groups).toHaveLength(1)
    expect(groups[0].pile.id).toBe('L18_S09')
    expect(groups[0].batches.map((batch) => Number(batch.batchNumber))).toEqual([24, 25, 31, 32])
  })

  it('preserves first-seen pile order across multiple piles', () => {
    const parsed = parsePendingBatchRows([
      { Pile_ID: 'PILE-B', Ore: 'LIM', Batch: 1, Last_Rit: 5, Status: 'CONTINUE' },
      { Pile_ID: 'PILE-A', Ore: 'SAP', Batch: 1, Last_Rit: 5, Status: 'CONTINUE' },
      { Pile_ID: 'PILE-B', Ore: 'LIM', Batch: 2, Last_Rit: 5, Status: 'CONTINUE' },
    ])
    if (!parsed.ok) throw new Error('invalid test fixture')

    const groups = groupPendingBatchesByPile(parsed.value)
    expect(groups.map((group) => group.pile.id)).toEqual(['PILE-B', 'PILE-A'])
    expect(groups[0].batches).toHaveLength(2)
  })

  it('returns an empty array for no rows', () => {
    expect(groupPendingBatchesByPile([])).toEqual([])
  })
})
