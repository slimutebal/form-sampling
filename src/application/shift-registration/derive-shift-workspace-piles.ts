import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '@/domain/handover/carry-over-pending-sample'
import { createPile, type Pile } from '@/domain/pile/pile'

/**
 * Builds the Pile list a new Shift workspace is initialized with (Phase
 * 18 wiring correction §6/§8/§11, corrected). `masterData.pileAreas` is
 * the master catalog/selection source for "Add Pile" — it is NOT the
 * list of active operational piles, and must never be preloaded wholesale
 * into a workspace just because a Pile happens to sit in the Shift's
 * Sector. A production pile only becomes active when the operator
 * explicitly adds it (`LocalOperationalStore.addPileToWorkspace`).
 *
 * The only piles a fresh workspace legitimately starts with are the ones
 * a handover carry-over actually references: every distinct PileId
 * across `pendingBatches`/`pendingSamples`, using each row's own carried
 * Ore (never a master-data lookup). No handover ("Start Without Previous
 * Shift") means an empty starting Pile list — `[]`, not an error.
 */
export function deriveShiftWorkspacePiles(
  pendingBatches: readonly PendingBatchCarryOver[],
  pendingSamples: readonly HandoverPendingSample[],
): readonly Pile[] {
  const byId = new Map<string, Pile>()

  for (const row of pendingBatches) {
    if (!byId.has(row.pile.id)) {
      byId.set(row.pile.id, row.pile)
    }
  }

  for (const sample of pendingSamples) {
    if (!byId.has(sample.pileId)) {
      byId.set(sample.pileId, createPile(sample.pileId, sample.oreCode))
    }
  }

  return [...byId.values()]
}
