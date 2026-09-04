import type { Clock } from '@/application/common/clock'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { MasterDataCacheEntry, MasterDataCacheStore, MasterDataRemoteReader } from './google-ports'

export interface RefreshMasterDataDeps {
  readonly reader: MasterDataRemoteReader
  readonly cache: MasterDataCacheStore
  readonly clock: Clock
}

/**
 * Refreshes the local master-data cache from Google (ROADMAP Phase 16
 * §6/§8). The remote catalog is fully fetched and validated — through
 * `MasterDataRemoteReader`, which always finishes with
 * `createMasterData()` — before anything is persisted: a failure at any
 * stage returns that failure untouched and never calls
 * `cache.replaceMasterDataCache`, so the existing cache is left exactly
 * as it was. This use case never reads or writes a Shift workspace, so
 * an active shift's own `workspace.masterData` snapshot can never be
 * affected by a refresh — the refreshed cache is only ever for a
 * future shift/setup to read via `readCachedMasterData`.
 */
export async function refreshMasterData(
  deps: RefreshMasterDataDeps,
): Promise<Result<MasterDataCacheEntry, DomainError>> {
  const remoteResult = await deps.reader.readMasterData()
  if (!remoteResult.ok) {
    return remoteResult
  }

  const fetchedAt = deps.clock.now()
  const replaceResult = await deps.cache.replaceMasterDataCache(remoteResult.value, fetchedAt)
  if (!replaceResult.ok) {
    return replaceResult
  }

  return ok({ masterData: remoteResult.value, fetchedAt })
}

export interface ReadCachedMasterDataDeps {
  readonly cache: MasterDataCacheStore
}

/** Reads the last successfully validated master-data snapshot, for offline startup / future shift setup (Phase 16 §8). */
export async function readCachedMasterData(
  deps: ReadCachedMasterDataDeps,
): Promise<Result<MasterDataCacheEntry | undefined, DomainError>> {
  return deps.cache.readCachedMasterData()
}
