import type { BatchPosition } from '@/domain/batch/batch-position'
import type { HaulageTransactionId, PileId } from '@/domain/common/identifiers'
import type { ProductionRecord } from '@/domain/production/production-record'
import { isEffectiveProductionRecord } from './effective-production'

/**
 * Finds the ACCEPT + ACTIVE ProductionRecord occupying one Pile/Batch/Rit
 * position, if any (Phase 4 §25 invariant: at most one ACCEPT + ACTIVE
 * record may ever occupy a given Pile_ID + Batch + Rit — a REJECT or
 * VOIDED record never occupies a slot, `isEffectiveProductionRecord`
 * already encodes that rule). `excludeTransactionId` lets a caller ask
 * "is this position available for MY OWN record" without that record's
 * own current row counting as its own conflict — used by both Edit
 * (REJECT -> ACCEPT at an unchanged position) and Switch (MOVE/SWAP
 * target-occupancy detection).
 */
export function findAcceptActiveOccupant(
  records: readonly ProductionRecord[],
  pileId: PileId,
  position: BatchPosition,
  excludeTransactionId?: HaulageTransactionId,
): ProductionRecord | undefined {
  return records.find(
    (record) =>
      record.transaction.pileId === pileId &&
      record.transaction.id !== excludeTransactionId &&
      isEffectiveProductionRecord(record) &&
      Number(record.effective.batchPosition.batchNumber) === Number(position.batchNumber) &&
      Number(record.effective.batchPosition.ritNumber) === Number(position.ritNumber),
  )
}
