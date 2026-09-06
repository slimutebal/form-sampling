import { localOperationalStore } from '@/app/local-operational-store'
import type { MasterDataCacheEntry, MasterDataCacheStore, MasterDataRemoteReader } from '@/application/google/google-ports'
import { systemClock, type Clock } from '@/application/common/clock'
import { refreshMasterData } from '@/application/google/master-data-sync'
import type { DomainError, Result } from '@/domain/common/result'
import { AppsScriptMasterDataRemoteReader } from '@/integrations/google/apps-script-master-data-remote-reader'
import { readGoogleRuntimeConfig } from './google-runtime-config'

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
 */
export async function refreshAppsScriptMasterData(
  overrides?: Partial<GoogleMasterDataSyncOverrides>,
): Promise<Result<MasterDataCacheEntry, DomainError>> {
  const cache = overrides?.cache ?? localOperationalStore
  const clock = overrides?.clock ?? systemClock

  if (overrides?.reader) {
    return refreshMasterData({ reader: overrides.reader, cache, clock })
  }

  const configResult = readGoogleRuntimeConfig()
  if (!configResult.ok) {
    return configResult
  }

  const reader = new AppsScriptMasterDataRemoteReader(configResult.value.appsScriptUrl)
  return refreshMasterData({ reader, cache, clock })
}
