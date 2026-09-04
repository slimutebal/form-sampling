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
 */
export const LOCAL_DATABASE_SCHEMA_VERSION = 2

/** Stable production database name (Phase 7 §12). */
export const DEFAULT_LOCAL_DATABASE_NAME = 'form-sampling'
