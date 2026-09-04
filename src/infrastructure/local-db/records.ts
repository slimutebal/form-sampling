import type { HaulageTransactionId, PileId, SamplePositionId, ShiftId } from '../../domain/common/identifiers'
import type { FleetSetup } from '../../domain/fleet/fleet-setup'
import type { PendingBatchCarryOver } from '../../domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '../../domain/handover/carry-over-pending-sample'
import type { HandoverSchemaVersion } from '../../domain/handover/handover-schema'
import type { HaulageTransaction } from '../../domain/haulage/haulage-transaction'
import type { MasterData } from '../../domain/master/master-data'
import type { Pile } from '../../domain/pile/pile'
import type { SamplePosition } from '../../domain/sample-handling/sample-position'
import type { Shift } from '../../domain/shift/shift'

/**
 * IndexedDB row for the `shiftWorkspaces` table (primary key: shiftId).
 * `shiftId` is always derived from `shift.id` — never an independently
 * supplied value that could contradict it (Phase 7 §42).
 *
 * `pendingBatches`/`pendingSamples` (Phase 12) hold the shift's carry-
 * over state reconstructed from a previous-shift handover import —
 * every CONTINUE and HOLD row is kept (rule 4: HOLD is preserved, not
 * discarded, but must not become active work on its own). Optional
 * (rather than defaulted to `[]` here) because an existing v1/v2 row
 * genuinely has no such fields on disk — `LocalOperationalStore`
 * defaults them to `[]` when writing a new record and when reading one
 * back (`LocalShiftWorkspace` always exposes concrete arrays). An empty
 * array (old or new row) means no previous-shift handover was imported
 * ("Start Without Previous Shift").
 */
export interface ShiftWorkspaceRecord {
  readonly shiftId: ShiftId
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  readonly pendingBatches?: readonly PendingBatchCarryOver[]
  readonly pendingSamples?: readonly HandoverPendingSample[]
}

/**
 * IndexedDB row for the `importHistory` table (primary key: fingerprint,
 * Phase 12 rule 8). One row per successfully committed handover import —
 * written only inside `LocalOperationalStore.initializeShiftWorkspace`'s
 * `handoverImport` parameter, atomically with the Shift workspace/carry-
 * over write it protects; a repeated `fingerprint` is rejected with
 * `DUPLICATE_IMPORT` rather than overwriting the original (mirrors the
 * add-only pattern used by `haulageTransactions`/`samplePositions`).
 * There is deliberately no standalone write path for this table — see
 * `initializeShiftWorkspace`'s doc comment for why (a fingerprint must
 * never become durably consumed without its carry-over state also being
 * durably persisted in the same atomic operation). Deliberately carries
 * no `currentShiftId` field of its own: `sourceShiftId` identifies the
 * *previous* shift the archive came from, while which current shift the
 * import is attached to is exactly the `shiftId` of the `shiftWorkspaces`
 * row committed in the same transaction.
 */
export interface ImportHistoryRecord {
  readonly fingerprint: string
  readonly sourceShiftId: ShiftId
  readonly schemaVersion: HandoverSchemaVersion
}

/**
 * IndexedDB row for the `haulageTransactions` table (primary key: id).
 * `shiftId`/`pileId` are top-level indexed copies derived from
 * `transaction`, never independently supplied (Phase 7 §42), so a query
 * index can never disagree with the stored transaction snapshot.
 */
export interface HaulageTransactionRecord {
  readonly id: HaulageTransactionId
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly transaction: HaulageTransaction
}

/**
 * IndexedDB row for the `samplePositions` table (primary key: id,
 * Phase 11). `shiftId`/`pileId` are top-level indexed copies derived
 * from `samplePosition`, never independently supplied (mirrors
 * `HaulageTransactionRecord`), so a query index can never disagree with
 * the stored snapshot.
 */
export interface SamplePositionRecord {
  readonly id: SamplePositionId
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly samplePosition: SamplePosition
}

/** The single metadata key used to mark the local current-shift pointer. */
export const CURRENT_SHIFT_METADATA_KEY = 'CURRENT_SHIFT_ID'

/** IndexedDB row for the `metadata` table (primary key: key). */
export interface MetadataRecord {
  readonly key: string
  readonly value: unknown
}
