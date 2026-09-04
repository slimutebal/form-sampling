import type { Clock } from '@/application/common/clock'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { ShiftSummaryOutboxStore, ShiftSummaryRemoteWriter, ShiftSummarySyncRecord } from './google-ports'
import type { ShiftSummary } from './shift-summary'

export interface QueueShiftSummaryDeps {
  readonly outbox: ShiftSummaryOutboxStore
  readonly clock: Clock
}

/**
 * Persists a Shift_Summary locally before any remote attempt (ROADMAP
 * Phase 16 §10/§12) — Google must never block field operation.
 * Deterministically replaces any existing queued payload for the same
 * Shift_ID rather than adding a second entry: a newer summary always
 * overwrites the older one (one outbox row per Shift_ID, by
 * construction of `upsertShiftSummarySyncRecord`), and status/attemptCount
 * reset to PENDING/0 so a freshly queued summary always gets a fresh
 * sync attempt.
 */
export async function queueShiftSummary(
  deps: QueueShiftSummaryDeps,
  summary: ShiftSummary,
): Promise<Result<void, DomainError>> {
  const record: ShiftSummarySyncRecord = {
    shiftId: summary.shiftId,
    summary,
    status: 'PENDING',
    attemptCount: 0,
    updatedAt: deps.clock.now(),
  }
  return deps.outbox.upsertShiftSummarySyncRecord(record)
}

export interface SyncShiftSummaryDeps {
  readonly outbox: ShiftSummaryOutboxStore
  readonly writer: ShiftSummaryRemoteWriter
  readonly clock: Clock
}

/**
 * Attempts to publish exactly the persisted payload for `shiftId`
 * (ROADMAP Phase 16 §10/§13) — never a freshly recomputed one. Moves the
 * record to SYNCING and increments `attemptCount` before attempting,
 * then finishes as SYNCED (clearing `lastErrorCode`) or FAILED (setting
 * `lastErrorCode`). A remote failure never loses or alters the
 * persisted `summary` payload — only `status`/`attemptCount`/
 * `lastErrorCode`/`updatedAt` change — so a subsequent retry publishes
 * the identical payload.
 */
export async function syncShiftSummary(
  deps: SyncShiftSummaryDeps,
  shiftId: ShiftId,
): Promise<Result<ShiftSummarySyncRecord, DomainError>> {
  const existingResult = await deps.outbox.getShiftSummarySyncRecord(shiftId)
  if (!existingResult.ok) {
    return existingResult
  }
  const existing = existingResult.value
  if (!existing) {
    return err({
      code: 'SHIFT_SUMMARY_SYNC_RECORD_NOT_FOUND',
      message: `No queued Shift_Summary sync record for ShiftId ${shiftId}`,
    })
  }

  const syncingRecord: ShiftSummarySyncRecord = {
    ...existing,
    status: 'SYNCING',
    attemptCount: existing.attemptCount + 1,
    updatedAt: deps.clock.now(),
  }
  const syncingWrite = await deps.outbox.upsertShiftSummarySyncRecord(syncingRecord)
  if (!syncingWrite.ok) {
    return syncingWrite
  }

  const upsertResult = await deps.writer.upsertShiftSummary(existing.summary)
  const finalRecord: ShiftSummarySyncRecord = upsertResult.ok
    ? { ...syncingRecord, status: 'SYNCED', lastErrorCode: undefined, updatedAt: deps.clock.now() }
    : { ...syncingRecord, status: 'FAILED', lastErrorCode: upsertResult.error.code, updatedAt: deps.clock.now() }

  const finalWrite = await deps.outbox.upsertShiftSummarySyncRecord(finalRecord)
  if (!finalWrite.ok) {
    return finalWrite
  }
  if (!upsertResult.ok) {
    return err(upsertResult.error)
  }
  return ok(finalRecord)
}

/**
 * Retries every PENDING/FAILED queued summary (ROADMAP Phase 16
 * §10/§13), in the order `listPendingShiftSummarySyncRecords` returns
 * them. Every record is attempted — one shift's failure never stops the
 * others. No timer/Background Sync API involved; this only runs when
 * explicitly called.
 */
export async function retryPendingShiftSummaries(
  deps: SyncShiftSummaryDeps,
): Promise<Result<readonly ShiftSummarySyncRecord[], DomainError>> {
  const pendingResult = await deps.outbox.listPendingShiftSummarySyncRecords()
  if (!pendingResult.ok) {
    return pendingResult
  }

  const results: ShiftSummarySyncRecord[] = []
  for (const pending of pendingResult.value) {
    const syncResult = await syncShiftSummary(deps, pending.shiftId)
    if (syncResult.ok) {
      results.push(syncResult.value)
      continue
    }
    const latest = await deps.outbox.getShiftSummarySyncRecord(pending.shiftId)
    if (latest.ok && latest.value) {
      results.push(latest.value)
    }
  }
  return ok(results)
}
