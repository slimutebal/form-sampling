import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { PileId, ShiftId } from '@/domain/common/identifiers'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { Pile } from '@/domain/pile/pile'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

/** One Batch's still-pending sampled Rit numbers for a Pile, ascending. */
export interface PendingSampleBatch {
  readonly batchNumber: BatchNumber
  readonly pendingRitNumbers: readonly RitNumber[]
}

/** One Pile's pending sample requirements, grouped and ordered by Batch. */
export interface PendingSamplePile {
  readonly pile: Pile
  readonly batches: readonly PendingSampleBatch[]
}

export interface DerivePendingSamplesParams {
  readonly shiftId: ShiftId
  readonly piles: readonly Pile[]
  readonly haulageTransactions: readonly HaulageTransaction[]
  readonly samplePositions: readonly SamplePosition[]
}

/**
 * Derives pending (undelivered/unhandled) sample requirements per Pile
 * per Batch (BR-UND-001/002, docs/ROADMAP.md Phase 11 §16-19).
 *
 * A HaulageTransaction with samplingEvaluation.sampleRequired === true is
 * a sample requirement at its BatchPosition; the stored sampling
 * snapshot is authoritative and is never re-evaluated here (§16).
 *
 * Requirements are collapsed by physical operational position
 * (Shift+Pile+Batch+Rit) before counting, so multiple transaction ids
 * recorded at the same position never multiply the pending count (§17)
 * — Phase 6 deliberately permits this ambiguity and correction policy is
 * out of scope here.
 *
 * A sampled Rit already covered by an existing SamplePosition's stored
 * sampledRitNumbers for the same Shift/Pile/Batch is removed from the
 * pending set (§18) — handled positions are never regenerated.
 *
 * Output is grouped Pile -> Batch -> pending Rit numbers, ordered by the
 * caller-supplied `piles` order, then BatchNumber ascending, then
 * RitNumber ascending (§19) — never by haulageTransactions/
 * samplePositions array/input order. A Pile with no pending batches is
 * omitted entirely (§29 — pile selection should offer only pending
 * piles).
 */
export function derivePendingSamples(params: DerivePendingSamplesParams): readonly PendingSamplePile[] {
  const { shiftId, piles, haulageTransactions, samplePositions } = params

  const pendingByPileBatch = new Map<PileId, Map<number, Set<number>>>()

  for (const transaction of haulageTransactions) {
    if (transaction.shiftId !== shiftId) continue
    if (!transaction.samplingEvaluation.sampleRequired) continue

    const pileId = transaction.pileId
    const batchNumber = Number(transaction.batchPosition.batchNumber)
    const ritNumber = Number(transaction.batchPosition.ritNumber)

    let byBatch = pendingByPileBatch.get(pileId)
    if (!byBatch) {
      byBatch = new Map<number, Set<number>>()
      pendingByPileBatch.set(pileId, byBatch)
    }
    let ritSet = byBatch.get(batchNumber)
    if (!ritSet) {
      ritSet = new Set<number>()
      byBatch.set(batchNumber, ritSet)
    }
    ritSet.add(ritNumber)
  }

  for (const position of samplePositions) {
    if (position.shiftId !== shiftId) continue
    const byBatch = pendingByPileBatch.get(position.pileId)
    if (!byBatch) continue
    const ritSet = byBatch.get(Number(position.batchNumber))
    if (!ritSet) continue
    for (const ritNumber of position.sampledRitNumbers) {
      ritSet.delete(Number(ritNumber))
    }
  }

  const result: PendingSamplePile[] = []
  for (const pile of piles) {
    const byBatch = pendingByPileBatch.get(pile.id)
    if (!byBatch) continue

    const sortedBatchNumbers = [...byBatch.keys()].sort((a, b) => a - b)
    const batches: PendingSampleBatch[] = []
    for (const batchNumber of sortedBatchNumbers) {
      const ritSet = byBatch.get(batchNumber)
      const pendingRitNumbers = ritSet ? [...ritSet].sort((a, b) => a - b) : []
      if (pendingRitNumbers.length === 0) continue
      batches.push({
        batchNumber: batchNumber as BatchNumber,
        pendingRitNumbers: pendingRitNumbers as RitNumber[],
      })
    }
    if (batches.length === 0) continue

    result.push({ pile, batches })
  }

  return result
}
