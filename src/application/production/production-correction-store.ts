import type { Result } from '@/domain/common/result'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface ProductionCorrectionStoreError {
  readonly code: string
}

export interface SwitchProductionRecordsParams {
  readonly updatedSource: ProductionRecord
  /** Present only for a SWAP (Phase 4 §10/§13/§14) — omitted for a MOVE to an empty position. */
  readonly updatedTarget?: ProductionRecord
}

/**
 * The smallest slice of `LocalOperationalStore` the Production Correction
 * engine (Phase 4) depends on, expressed purely in application/domain
 * types — mirrors `ProductionRecordStore`/`ProductionDetailStore`.
 * `LocalOperationalStore` already structurally satisfies this port, so
 * the production singleton is passed directly with no adapter.
 *
 * Every method here takes an already domain-validated, fully rebuilt
 * `ProductionRecord` (the caller has already run `applyEditFields`/
 * `applySwitchPosition`/`applyVoidRecord`) — this port only ever persists
 * a correction, it never computes one.
 */
export interface ProductionCorrectionStore {
  /** Persists an EDIT_FIELDS-corrected ProductionRecord (Phase 4 §4/§6). Re-checks the Pile+Batch+Rit ACCEPT+ACTIVE slot invariant (§25) at the atomic write boundary. */
  updateProductionRecordWithCorrection(
    updatedRecord: ProductionRecord,
  ): Promise<Result<void, ProductionCorrectionStoreError>>

  /** Persists a MOVE (`updatedTarget` omitted) or SWAP (`updatedTarget` present) atomically in one Dexie transaction (Phase 4 §15) — if either write would violate the slot invariant, neither row changes. */
  switchProductionRecords(
    params: SwitchProductionRecordsParams,
  ): Promise<Result<void, ProductionCorrectionStoreError>>

  /** Persists a VOID_RECORD-corrected ProductionRecord (Phase 4 §19/§20). Never a hard delete — the row is updated in place, never removed. */
  voidProductionRecord(updatedRecord: ProductionRecord): Promise<Result<void, ProductionCorrectionStoreError>>
}
