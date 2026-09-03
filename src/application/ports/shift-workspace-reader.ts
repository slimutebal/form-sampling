import type { Result } from '@/domain/common/result'
import type { Shift } from '@/domain/shift/shift'

/**
 * The smallest read shape the Start/Resume screen actually needs from a
 * stored shift workspace. Deliberately does not mirror
 * `LocalShiftWorkspace` (piles/masterData/fleetSetup) — this is an
 * application-owned contract, not a re-export of an infrastructure type.
 */
export interface CurrentShiftWorkspace {
  readonly shift: Shift
}

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy.
 */
export interface ShiftWorkspaceReadError {
  readonly code: string
}

/**
 * The smallest slice of `LocalOperationalStore` the Start/Resume screen
 * depends on, expressed purely in application/domain types. Nothing in
 * `src/application/**` may import from `src/infrastructure/**` — the
 * dependency points the other way: `LocalOperationalStore` happens to
 * structurally satisfy this port already (its `LocalShiftWorkspace` is a
 * superset of `CurrentShiftWorkspace`, its `LocalDatabaseError` a
 * superset of `ShiftWorkspaceReadError`), so the production singleton is
 * passed directly with no adapter.
 */
export interface ShiftWorkspaceReader {
  loadCurrentShiftWorkspace(): Promise<Result<CurrentShiftWorkspace | undefined, ShiftWorkspaceReadError>>
}
