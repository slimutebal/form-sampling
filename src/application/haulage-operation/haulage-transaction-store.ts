import type { Result } from '@/domain/common/result'
import type { PileId, ShiftId } from '@/domain/common/identifiers'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface HaulageStoreError {
  readonly code: string
}

/**
 * The smallest slice of `LocalOperationalStore` the Pile Haulage feature
 * depends on, expressed purely in application/domain types. Nothing in
 * `src/application/**` may import from `src/infrastructure/**` — the
 * dependency points the other way:`LocalOperationalStore` already
 * structurally satisfies this port (its `LocalDatabaseError` is a
 * superset of `HaulageStoreError`, and its two methods match these
 * signatures), so the production singleton is passed directly with no
 * adapter.
 */
export interface HaulageTransactionStore {
  listHaulageTransactionsForShiftPile(
    shiftId: ShiftId,
    pileId: PileId,
  ): Promise<Result<readonly HaulageTransaction[], HaulageStoreError>>

  addHaulageTransaction(transaction: HaulageTransaction): Promise<Result<void, HaulageStoreError>>
}
