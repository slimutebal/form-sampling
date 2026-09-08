import type { ShiftId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface ProductionDetailStoreError {
  readonly code: string
}

/**
 * The smallest slice of `LocalOperationalStore` the Production Detail
 * screens (Phase 3) depend on, expressed purely in application/domain
 * types. `LocalOperationalStore` already structurally satisfies this
 * port, so the production singleton is passed directly with no adapter.
 * Every Production Detail screen (Pile/Batch/Rit) reads the full Shift's
 * ProductionRecord/SamplePosition sets and scopes them itself via the
 * Phase 3 projection functions — there is no separate per-Pile/per-Batch
 * read path, mirroring how `derivePendingSamples` already works
 * Shift-wide.
 */
export interface ProductionDetailStore {
  listProductionRecordsForShift(
    shiftId: ShiftId,
  ): Promise<Result<readonly ProductionRecord[], ProductionDetailStoreError>>

  listSamplePositionsForShift(
    shiftId: ShiftId,
  ): Promise<Result<readonly SamplePosition[], ProductionDetailStoreError>>
}
