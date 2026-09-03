import { describe, expect, it } from 'vitest'
import { parsePileId } from '../common/identifiers'
import { createPendingBatch, sortPendingBatchesByBatchNumber, type PendingBatch } from './pending-batch'
import { parseBatchNumber } from './batch-number'
import { parseRitNumber } from './rit-number'
import type { PendingStatus } from './pending-status'

function pendingBatch(pileIdValue: string, batchValue: number, ritValue: number, status: PendingStatus): PendingBatch {
  const pileId = parsePileId(pileIdValue)
  const batchNumber = parseBatchNumber(batchValue)
  const lastRit = parseRitNumber(ritValue)
  if (!pileId.ok || !batchNumber.ok || !lastRit.ok) {
    throw new Error('invalid test fixture')
  }
  return createPendingBatch({
    pileId: pileId.value,
    batchNumber: batchNumber.value,
    lastRit: lastRit.value,
    status,
  })
}

describe('PendingBatch', () => {
  it('represents multiple pending batches for a single pile without loss (BR-PEND-003)', () => {
    const batches = [
      pendingBatch('L18_S09', 24, 10, 'CONTINUE'),
      pendingBatch('L18_S09', 25, 3, 'CONTINUE'),
      pendingBatch('L18_S09', 31, 18, 'CONTINUE'),
      pendingBatch('L18_S09', 32, 14, 'CONTINUE'),
    ]

    expect(batches).toHaveLength(4)
    expect(batches.map((b) => Number(b.batchNumber))).toEqual([24, 25, 31, 32])
    expect(batches.every((b) => b.pileId === batches[0].pileId)).toBe(true)
  })

  it('sorts pending batches deterministically by batch number (BR-PEND-004)', () => {
    const unsorted = [
      pendingBatch('L18_S09', 32, 14, 'CONTINUE'),
      pendingBatch('L18_S09', 24, 10, 'CONTINUE'),
      pendingBatch('L18_S09', 31, 18, 'CONTINUE'),
      pendingBatch('L18_S09', 25, 3, 'CONTINUE'),
    ]

    const sorted = sortPendingBatchesByBatchNumber(unsorted)

    expect(sorted.map((b) => [Number(b.batchNumber), Number(b.lastRit)])).toEqual([
      [24, 10],
      [25, 3],
      [31, 18],
      [32, 14],
    ])
  })

  it('does not mutate the input array when sorting', () => {
    const unsorted = [pendingBatch('P1', 5, 1, 'HOLD'), pendingBatch('P1', 2, 1, 'HOLD')]
    const originalOrder = unsorted.map((b) => Number(b.batchNumber))

    sortPendingBatchesByBatchNumber(unsorted)

    expect(unsorted.map((b) => Number(b.batchNumber))).toEqual(originalOrder)
  })
})
