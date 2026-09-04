import { sortPendingBatchesByBatchNumber } from '@/domain/batch/pending-batch'
import type { PendingBatch } from '@/domain/batch/pending-batch'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { Pile } from '@/domain/pile/pile'

export interface PendingBatchGroup {
  readonly pile: Pile
  readonly batches: readonly PendingBatch[]
}

/**
 * Groups pending-batch carry-over rows by Pile for card rendering
 * (UI_UX_SPEC.md §21), preserving first-seen Pile order and sorting each
 * Pile's batches in deterministic numeric order (BR-PEND-004) via the
 * existing domain sort — never re-implemented here. Pure presentation
 * grouping, not a business rule.
 */
export function groupPendingBatchesByPile(rows: readonly PendingBatchCarryOver[]): readonly PendingBatchGroup[] {
  const pilesInOrder: Pile[] = []
  const batchesByPileId = new Map<string, PendingBatch[]>()

  for (const row of rows) {
    if (!batchesByPileId.has(row.pile.id)) {
      batchesByPileId.set(row.pile.id, [])
      pilesInOrder.push(row.pile)
    }
    batchesByPileId.get(row.pile.id)?.push(row.pendingBatch)
  }

  return pilesInOrder.map((pile) => ({
    pile,
    batches: sortPendingBatchesByBatchNumber(batchesByPileId.get(pile.id) ?? []),
  }))
}
