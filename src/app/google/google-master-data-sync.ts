import { localOperationalStore } from '@/app/local-operational-store'
import type { MasterDataCacheEntry, MasterDataCacheStore, MasterDataRemoteReader } from '@/application/google/google-ports'
import { systemClock, type Clock } from '@/application/common/clock'
import { describeMasterDataRefreshFailure } from '@/application/google/master-data-refresh-diagnostics'
import { refreshMasterData } from '@/application/google/master-data-sync'
import type { DomainError, Result } from '@/domain/common/result'
import { AppsScriptMasterDataRemoteReader } from '@/integrations/google/apps-script-master-data-remote-reader'
import { readGoogleRuntimeConfig } from './google-runtime-config'
import { reportMasterDataDiagnostic } from './master-data-diagnostics'

/**
 * Composition boundary for Apps Script master-data refresh. Future shift
 * summary delivery can use the same endpoint with POST, without changing
 * the domain port or the cache workflow.
 */

export interface GoogleMasterDataSyncOverrides {
  /** Test-only escape hatch: skip runtime configuration/HTTP and supply the remote reader directly. */
  readonly reader: MasterDataRemoteReader
  readonly cache: MasterDataCacheStore
  readonly clock: Clock
}

/**
 * Composition boundary: runtime config → `AppsScriptMasterDataRemoteReader`
 * → existing `refreshMasterData`
 * use case, writing into the app-wide `localOperationalStore` cache. No
 * Google range contract, parser, validation, or cache-persistence logic is
 * duplicated here — every one of those pieces is reused unchanged.
 *
 * `overrides` exists only for tests (inject a fake reader/cache/clock);
 * production callers invoke this with no arguments.
 *
 * Production calls are single-flight: callers arriving while a request is
 * running receive that same Promise (one JSONP request, at most one cache
 * write, one result for everyone). The shared reference is cleared as soon
 * as it settles — before any caller resumes — so the next call, including
 * a retry after a failure, always starts a fresh request. Calls with
 * `overrides` never join or start the shared request.
 */
export function refreshAppsScriptMasterData(
  overrides?: Partial<GoogleMasterDataSyncOverrides>,
): Promise<Result<MasterDataCacheEntry, DomainError>> {
  if (overrides) return runRefresh(overrides, () => 0)

  if (sharedRefresh) {
    sharedRefresh.join()
    return sharedRefresh.promise
  }
  let joinedCallers = 0
  const promise = runRefresh(undefined, () => joinedCallers).then(
    (result) => {
      release()
      if (result.ok) refreshedListeners.forEach((listener) => listener(result.value))
      return result
    },
    (failure: unknown) => {
      // An unexpected rejection must not leave the shared slot occupied forever.
      release()
      throw failure
    },
  )
  const flight: SharedRefresh = {
    promise,
    join: () => {
      joinedCallers += 1
    },
  }
  const release = () => {
    if (sharedRefresh === flight) sharedRefresh = undefined
  }
  sharedRefresh = flight
  return promise
}

interface SharedRefresh {
  readonly promise: Promise<Result<MasterDataCacheEntry, DomainError>>
  readonly join: () => void
}

let sharedRefresh: SharedRefresh | undefined
const refreshedListeners = new Set<(entry: MasterDataCacheEntry) => void>()

/**
 * Notifies after every successful production refresh (already validated
 * and cached), whoever started it — lets a screen that showed a failure
 * recover when a later background refresh succeeds. Returns unsubscribe.
 */
export function subscribeToMasterDataRefreshed(listener: (entry: MasterDataCacheEntry) => void): () => void {
  refreshedListeners.add(listener)
  return () => {
    refreshedListeners.delete(listener)
  }
}

async function runRefresh(
  overrides: Partial<GoogleMasterDataSyncOverrides> | undefined,
  joinedCallers: () => number,
): Promise<Result<MasterDataCacheEntry, DomainError>> {
  const cache = overrides?.cache ?? localOperationalStore
  const clock = overrides?.clock ?? systemClock
  let cacheWriteFailed = false
  // Diagnostics only: tags a cache-write failure, whose code alone cannot be told apart from other store errors.
  const observedCache: MasterDataCacheStore = {
    readCachedMasterData: () => cache.readCachedMasterData(),
    replaceMasterDataCache: async (masterData, fetchedAt) => {
      const written = await cache.replaceMasterDataCache(masterData, fetchedAt)
      if (!written.ok) cacheWriteFailed = true
      return written
    },
  }

  const result = await refreshWith(overrides?.reader, observedCache, clock)
  if (!result.ok) {
    reportMasterDataDiagnostic({
      ...describeMasterDataRefreshFailure(result.error, cacheWriteFailed ? 'CACHE_WRITE' : undefined, clock.now()),
      joinedCallers: joinedCallers(),
    })
  }
  return result
}

async function refreshWith(
  overrideReader: MasterDataRemoteReader | undefined,
  cache: MasterDataCacheStore,
  clock: Clock,
): Promise<Result<MasterDataCacheEntry, DomainError>> {
  if (overrideReader) {
    return refreshMasterData({ reader: overrideReader, cache, clock })
  }

  const configResult = readGoogleRuntimeConfig()
  if (!configResult.ok) {
    return configResult
  }

  const reader = new AppsScriptMasterDataRemoteReader(configResult.value.appsScriptUrl)
  return refreshMasterData({ reader, cache, clock })
}
