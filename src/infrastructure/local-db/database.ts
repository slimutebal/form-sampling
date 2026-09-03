/**
 * Explicit IndexedDB schema version for the local operational database
 * (Phase 7 §11). No speculative future versions are declared — a
 * migration is added only when a future schema change actually needs
 * one, and it must never destructively reset existing shift data.
 */
export const LOCAL_DATABASE_SCHEMA_VERSION = 1

/** Stable production database name (Phase 7 §12). */
export const DEFAULT_LOCAL_DATABASE_NAME = 'form-sampling'
