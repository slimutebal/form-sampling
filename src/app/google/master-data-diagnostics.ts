import type { MasterDataRefreshDiagnostic } from '@/application/google/master-data-refresh-diagnostics'

const MAX_RETAINED = 10
let retained: MasterDataRefreshDiagnostic[] = []

/**
 * Retains (bounded) and logs one master-data failure. Callers only ever
 * pass `describeMasterDataRefreshFailure` output — codes, stage, table and
 * row number — so no name, ID, payload, or error message is ever printed.
 */
export function reportMasterDataDiagnostic(diagnostic: MasterDataRefreshDiagnostic): void {
  retained = [...retained.slice(-(MAX_RETAINED - 1)), diagnostic]
  console.warn('[master-data] refresh failure', diagnostic)
}

/** Most recent failures, oldest first. */
export function readMasterDataDiagnostics(): readonly MasterDataRefreshDiagnostic[] {
  return retained
}

/** Test-only reset. */
export function clearMasterDataDiagnostics(): void {
  retained = []
}
