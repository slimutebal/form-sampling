import type { Result, DomainError } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'

interface LandingMasterDataDependencies {
  readonly readCachedMasterData: () => Promise<Result<{ readonly masterData: MasterData } | undefined, DomainError>>
  readonly refreshMasterData: () => Promise<Result<{ readonly masterData: MasterData }, DomainError>>
  readonly isOnline: () => boolean
}

export type LandingMasterDataLoadResult =
  | { readonly kind: 'ready'; readonly masterData: MasterData }
  | { readonly kind: 'offline-first-use' }
  | { readonly kind: 'failed'; readonly code: string }

function logLandingMasterData(event: string, details: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.info(`[master-data] ${event}`, details)
}

/**
 * Uses a validated IndexedDB cache when available. On first use it returns
 * the validated refresh result directly, avoiding a second cache read racing
 * with startup after the refresh has completed.
 */
export async function loadLandingMasterData(
  dependencies: LandingMasterDataDependencies,
): Promise<LandingMasterDataLoadResult> {
  const cached = await dependencies.readCachedMasterData()
  if (!cached.ok) {
    logLandingMasterData('cache-unavailable', { code: cached.error.code })
    return { kind: 'failed', code: cached.error.code }
  }
  if (cached.value) {
    logLandingMasterData('cache-hit', {})
    return { kind: 'ready', masterData: cached.value.masterData }
  }
  if (!dependencies.isOnline()) {
    logLandingMasterData('offline-without-cache', {})
    return { kind: 'offline-first-use' }
  }

  logLandingMasterData('cache-miss-refreshing-remote', {})
  const refreshed = await dependencies.refreshMasterData()
  if (!refreshed.ok) logLandingMasterData('remote-refresh-failed', { code: refreshed.error.code })
  else logLandingMasterData('remote-refresh-succeeded', {})
  return refreshed.ok
    ? { kind: 'ready', masterData: refreshed.value.masterData }
    : { kind: 'failed', code: refreshed.error.code }
}
