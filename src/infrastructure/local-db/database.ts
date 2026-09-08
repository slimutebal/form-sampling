/**
 * Explicit IndexedDB schema version for the local operational database
 * (Phase 7 §11). No speculative future versions are declared — a
 * migration is added only when a future schema change actually needs
 * one, and it must never destructively reset existing shift data.
 *
 * v2 (Phase 11): adds the `samplePositions` table. The v1 `.stores()`
 * declaration is preserved unchanged alongside the new v2 declaration
 * (see `LocalOperationalDatabase`) so that existing v1 shiftWorkspaces/
 * haulageTransactions/metadata data survives the upgrade.
 *
 * v3 (Phase 12): adds the `importHistory` table (fingerprint-keyed
 * handover duplicate-import protection, rule 8). The v1/v2 `.stores()`
 * declarations are preserved unchanged. `shiftWorkspaces` rows also gain
 * `pendingBatches`/`pendingSamples` fields, but since those are plain
 * (non-indexed) object fields — not a new table or index — Dexie
 * requires no additional `.stores()` version for them; existing v1/v2
 * rows simply have no such fields until a new import writes them.
 *
 * v4 (Phase 16): adds `masterDataCache` (a single row keyed `'current'`,
 * holding the latest validated Google master-data snapshot for a
 * future shift/setup — never the active shift's own
 * `shiftWorkspaces` row) and `shiftSummarySync` (one offline outbox row
 * per Shift_ID for the Google Shift_Summary sync). The v1/v2/v3
 * `.stores()` declarations are preserved unchanged, so every existing
 * shiftWorkspaces/haulageTransactions/samplePositions/importHistory/
 * metadata row survives the upgrade untouched.
 *
 * v5 (Production Data Model): adds `productionRecords` (one row per
 * HaulageTransaction, primary key: id, holding a `ProductionRecord` —
 * the immutable original transaction plus the operator-observed/
 * correctable production fields around it). The v1/v2/v3/v4 `.stores()`
 * declarations are preserved unchanged — `haulageTransactions` itself is
 * untouched, so every existing HaulageTransaction API keeps working. An
 * `.upgrade()` step migrates every pre-existing `haulageTransactions`
 * row into a corresponding legacy `productionRecords` row (disposition
 * ACCEPT, status ACTIVE, physicalCondition/contamination/remark/audit
 * fields null, no corrections) — no DRY/CLN/timestamp/user is invented
 * for data recorded before production recording existed.
 */
export const LOCAL_DATABASE_SCHEMA_VERSION = 5

/** Stable production database name (Phase 7 §12). */
export const DEFAULT_LOCAL_DATABASE_NAME = 'form-sampling'
