import type { PileId, ShiftId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface ProductionRecordStoreError {
  readonly code: string
}

export interface AddProductionTransactionParams {
  readonly transaction: HaulageTransaction
  readonly productionRecord: ProductionRecord
}

/**
 * The smallest slice of `LocalOperationalStore` the Production Record
 * screen depends on, expressed purely in application/domain types.
 * Nothing in `src/application/**` may import from `src/infrastructure/**`
 * — the dependency points the other way: `LocalOperationalStore` already
 * structurally satisfies this port (its `LocalDatabaseError` is a
 * superset of `ProductionRecordStoreError`, and its
 * `addProductionTransaction`/`listProductionRecordsForShiftPile` methods
 * match these signatures), so the production singleton is passed
 * directly with no adapter.
 *
 * Deliberately does not expose `addHaulageTransaction`/
 * `addProductionRecord` separately — `addProductionTransaction` is the
 * only write path this screen ever uses, so a HaulageTransaction can
 * never be persisted here without its paired ProductionRecord.
 */
export interface ProductionRecordStore {
  listProductionRecordsForShiftPile(
    shiftId: ShiftId,
    pileId: PileId,
  ): Promise<Result<readonly ProductionRecord[], ProductionRecordStoreError>>

  addProductionTransaction(
    params: AddProductionTransactionParams,
  ): Promise<Result<void, ProductionRecordStoreError>>
}
