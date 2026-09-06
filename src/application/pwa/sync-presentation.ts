import type { ShiftSummarySyncStatus } from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'

export type SyncPresentationStatus = 'ALL_SYNCED' | 'SYNC_PENDING' | 'SYNC_FAILED' | 'SYNCING'

export interface SyncPresentation {
  readonly status: SyncPresentationStatus
  readonly pendingCount: number
  readonly failedCount: number
  readonly syncingCount: number
}

/** The smallest read shape the global status UI needs from an outbox row. */
export interface SyncStatusRecord {
  readonly status: ShiftSummarySyncStatus
}

/**
 * Derives the single UI-facing sync status from every outbox row (ROADMAP
 * Phase 18 §10). A FAILED row outranks PENDING/SYNCING regardless of how
 * many rows exist in each state — one failure must stay visible even while
 * other shifts are still syncing. No queued row at all is ALL_SYNCED.
 */
export function deriveSyncPresentation(records: readonly SyncStatusRecord[]): SyncPresentation {
  let pendingCount = 0
  let failedCount = 0
  let syncingCount = 0
  for (const record of records) {
    if (record.status === 'FAILED') failedCount++
    else if (record.status === 'PENDING') pendingCount++
    else if (record.status === 'SYNCING') syncingCount++
  }

  const status: SyncPresentationStatus =
    failedCount > 0 ? 'SYNC_FAILED' : pendingCount > 0 ? 'SYNC_PENDING' : syncingCount > 0 ? 'SYNCING' : 'ALL_SYNCED'

  return { status, pendingCount, failedCount, syncingCount }
}

/**
 * The smallest slice of `LocalOperationalStore` the global status UI
 * depends on, mirroring the existing `ShiftWorkspaceReader`/
 * `MasterDataCacheStore` narrow-port pattern (nothing in
 * `src/application/**` imports from `src/infrastructure/**`).
 * `LocalOperationalStore` structurally satisfies this already via
 * `listShiftSummarySyncRecords` — no adapter class is needed.
 */
export interface ShiftSummarySyncStatusReader {
  listShiftSummarySyncRecords(): Promise<Result<readonly SyncStatusRecord[], DomainError>>
}
