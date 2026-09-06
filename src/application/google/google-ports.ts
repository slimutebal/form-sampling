import type { ShiftSummary } from '@/application/google/shift-summary'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { PileAreaReference } from '@/domain/master/references'

/** One Google Sheets values-range payload, as returned by the values API or supplied to it. */
export interface GoogleSheetsValueRange {
  readonly range: string
  readonly values: readonly (readonly unknown[])[]
}

/**
 * Minimal authenticated Google Sheets REST transport (ROADMAP Phase 16
 * §5). Concrete HTTP/Google Sheets API v4 adaptation lives in
 * `src/integrations/google/google-sheets-rest-client.ts`; this port is
 * the only thing application-layer use cases depend on, so they remain
 * testable with a fake transport and independent of `fetch`.
 */
export interface GoogleSheetsTransport {
  getValues(spreadsheetId: string, range: string): Promise<Result<GoogleSheetsValueRange, DomainError>>
  updateValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>>
  appendValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>>
}

/**
 * Reads and validates the entire remote master-data catalog in one shot
 * (ROADMAP Phase 16 §6). Implemented in `src/integrations/google/
 * master-data-sheet-reader.ts`, composing a `GoogleSheetsTransport` with
 * the Google row-parsing/schema-adaptation logic — application code
 * never sees a raw Sheets row.
 */
export interface MasterDataRemoteReader {
  readMasterData(): Promise<Result<MasterData, DomainError>>
}

/** One locally cached, previously validated master-data snapshot, distinct from any active shift's own `workspace.masterData` (Phase 16 §6). */
export interface MasterDataCacheEntry {
  readonly masterData: MasterData
  readonly fetchedAt: Date
}

/**
 * Local persistence boundary for the master-data cache (Phase 16 §6/§7).
 * Structurally satisfied by `LocalOperationalStore` — no adapter class is
 * needed, mirroring the existing `ShiftWorkspaceReader` port pattern.
 */
export interface MasterDataCacheStore {
  readCachedMasterData(): Promise<Result<MasterDataCacheEntry | undefined, DomainError>>
  replaceMasterDataCache(masterData: MasterData, fetchedAt: Date): Promise<Result<void, DomainError>>
}

/**
 * Publishes one upserted Shift_Summary row to Google Sheets (Phase 16
 * §9). Implemented in `src/integrations/google/
 * shift-summary-sheet-writer.ts` — the only place that knows how to find
 * an existing row by Shift_ID and choose update vs. append.
 */
export interface ShiftSummaryRemoteWriter {
  upsertShiftSummary(summary: ShiftSummary): Promise<Result<void, DomainError>>
}

/**
 * Writes one newly created Pile_Areas row to the shared Google master
 * (Phase 18 §6). Implemented in `src/integrations/google/
 * apps-script-pile-area-writer.ts` — the first concrete implementation of
 * the POST write shape `docs/GOOGLE_APPS_SCRIPT_CONTRACT.md` reserves.
 * Because this mutates the shared master, the caller (not this port) is
 * responsible for the online-only gate — this method never checks
 * connectivity itself.
 */
export interface PileAreaRemoteWriter {
  addPileArea(pileArea: PileAreaReference): Promise<Result<void, DomainError>>
}

export type ShiftSummarySyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'

/** One outbox row per Shift_ID (Phase 16 §10/§12) — never more than one logical entry per shift. */
export interface ShiftSummarySyncRecord {
  readonly shiftId: ShiftId
  readonly summary: ShiftSummary
  readonly status: ShiftSummarySyncStatus
  readonly attemptCount: number
  readonly lastErrorCode?: string
  readonly updatedAt: Date
}

/**
 * Local offline outbox for Shift_Summary sync (Phase 16 §10/§12).
 * Structurally satisfied by `LocalOperationalStore`, mirroring
 * `MasterDataCacheStore`.
 */
export interface ShiftSummaryOutboxStore {
  upsertShiftSummarySyncRecord(record: ShiftSummarySyncRecord): Promise<Result<void, DomainError>>
  getShiftSummarySyncRecord(shiftId: ShiftId): Promise<Result<ShiftSummarySyncRecord | undefined, DomainError>>
  listPendingShiftSummarySyncRecords(): Promise<Result<readonly ShiftSummarySyncRecord[], DomainError>>
}
