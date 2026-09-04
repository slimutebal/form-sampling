import type { ShiftId } from '@/domain/common/identifiers'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '@/domain/handover/carry-over-pending-sample'
import type { HandoverSchemaVersion } from '@/domain/handover/handover-schema'

/**
 * The reconstructed carry-over state produced by a confirmed handover
 * import (rule 9), ready to be attached to the new Shift once it is
 * created via `LocalOperationalStore.initializeShiftWorkspace`.
 * `pendingBatches` intentionally keeps every CONTINUE and HOLD row —
 * only `@/domain/handover/carry-over-pending-batch`
 * `selectActiveContinuationBatches`/`selectActiveCarryOverPiles` decide
 * what becomes active work (rule 4); nothing is discarded here.
 */
export interface HandoverCarryOverState {
  readonly sourceShiftId: ShiftId
  readonly fingerprint: string
  readonly schemaVersion: HandoverSchemaVersion
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly pendingSamples: readonly HandoverPendingSample[]
}
