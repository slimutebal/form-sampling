import { LocalOperationalStore } from '@/infrastructure/local-db/local-operational-store'

/**
 * Production composition root for the local operational database
 * (Phase 7). A single instance is shared across the app so routes never
 * open more than one IndexedDB connection to the same database.
 */
export const localOperationalStore = new LocalOperationalStore()
