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
 */
export const LOCAL_DATABASE_SCHEMA_VERSION = 3

/** Stable production database name (Phase 7 §12). */
export const DEFAULT_LOCAL_DATABASE_NAME = 'form-sampling'
