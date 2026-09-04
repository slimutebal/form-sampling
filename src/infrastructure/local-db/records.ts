import type { HaulageTransactionId, PileId, SamplePositionId, ShiftId } from '../../domain/common/identifiers'
import type { FleetSetup } from '../../domain/fleet/fleet-setup'
import type { HaulageTransaction } from '../../domain/haulage/haulage-transaction'
import type { MasterData } from '../../domain/master/master-data'
import type { Pile } from '../../domain/pile/pile'
import type { SamplePosition } from '../../domain/sample-handling/sample-position'
import type { Shift } from '../../domain/shift/shift'

/**
 * IndexedDB row for the `shiftWorkspaces` table (primary key: shiftId).
 * `shiftId` is always derived from `shift.id` — never an independently
 * supplied value that could contradict it (Phase 7 §42).
 */
export interface ShiftWorkspaceRecord {
  readonly shiftId: ShiftId
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
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
