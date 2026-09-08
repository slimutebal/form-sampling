import type { Result } from '@/domain/common/result'
import type { ShiftId } from '@/domain/common/identifiers'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface SampleHandlingStoreError {
  readonly code: string
}

/**
 * The smallest slice of `LocalOperationalStore` the Sample Handling
 * feature depends on, expressed purely in application/domain types.
 * Nothing in `src/application/**` may import from
 * `src/infrastructure/**` — the dependency points the other way:
 * `LocalOperationalStore` already structurally satisfies this port (its
 * `LocalDatabaseError` is a superset of `SampleHandlingStoreError`, and
 * its methods match these signatures), so the production singleton is
 * passed directly with no adapter.
 */
export interface SampleHandlingStore {
  listHaulageTransactionsForShift(
    shiftId: ShiftId,
  ): Promise<Result<readonly HaulageTransaction[], SampleHandlingStoreError>>

  /**
   * Effective (ACCEPT + ACTIVE) production eligibility — Phase 2 —
   * requires the ProductionRecord for each transaction, not just the raw
   * transaction: a REJECT record's HaulageTransaction must never be
   * counted toward pending sample requirements.
   */
  listProductionRecordsForShift(
    shiftId: ShiftId,
  ): Promise<Result<readonly ProductionRecord[], SampleHandlingStoreError>>

  listSamplePositionsForShift(
    shiftId: ShiftId,
  ): Promise<Result<readonly SamplePosition[], SampleHandlingStoreError>>

  addSamplePosition(samplePosition: SamplePosition): Promise<Result<void, SampleHandlingStoreError>>
}
