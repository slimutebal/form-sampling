import type { OreCode } from '../common/codes'
import type { PileId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { PendingBatchCarryOver } from './carry-over-pending-batch'
import type { HandoverPendingSample } from './carry-over-pending-sample'

/**
 * Validates that, within one archive, the same PileId always resolves
 * to exactly one OreCode across every Pending_Sample row and every
 * NOT_PICKED_UP Sample_Position carry-over row (rule: "the same PileId
 * must always resolve to exactly one OreCode"). A Pile appearing with
 * two different Ore codes anywhere in the archive means the archive
 * itself is internally inconsistent — the whole import is rejected with
 * `HANDOVER_PILE_ORE_CONFLICT` rather than the conflict being resolved
 * by picking a first/last/preferred value or otherwise normalized/
 * guessed at.
 *
 * A Pile with multiple pending batches sharing the same Ore remains
 * valid (BR-PEND-003) — only a genuine *different* Ore for the same
 * Pile is a conflict. A pending sample for a Pile with no pending batch
 * at all is also valid; it simply establishes that Pile's Ore for the
 * first time.
 *
 * Deliberately takes both already-parsed collections rather than raw
 * rows — this runs after `parsePendingBatchRows`/
 * `parseSamplePositionCarryOverRows` have already individually
 * validated each row (rule 7: fail on the first invalid piece before
 * doing cross-row consistency checks).
 */
export function validateArchivePileOreConsistency(
  pendingBatches: readonly PendingBatchCarryOver[],
  pendingSamples: readonly HandoverPendingSample[],
): Result<void, DomainError> {
  const oreByPile = new Map<PileId, OreCode>()

  for (const row of pendingBatches) {
    const conflict = checkAndRecord(oreByPile, row.pile.id, row.pile.oreCode)
    if (conflict) {
      return conflict
    }
  }

  for (const sample of pendingSamples) {
    const conflict = checkAndRecord(oreByPile, sample.pileId, sample.oreCode)
    if (conflict) {
      return conflict
    }
  }

  return ok(undefined)
}

function checkAndRecord(
  oreByPile: Map<PileId, OreCode>,
  pileId: PileId,
  oreCode: OreCode,
): Result<never, DomainError> | undefined {
  const existing = oreByPile.get(pileId)
  if (existing !== undefined && existing !== oreCode) {
    return err({
      code: 'HANDOVER_PILE_ORE_CONFLICT',
      message: `Pile ${pileId} resolves to conflicting Ore codes (${existing} vs ${oreCode}) within this archive`,
    })
  }
  oreByPile.set(pileId, oreCode)
  return undefined
}
