import { useCallback, useEffect, useState } from 'react'
import type { MasterDataCacheStore } from '@/application/google/google-ports'

export type MasterDataCacheStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'never-synced' }
  | { readonly kind: 'synced'; readonly fetchedAt: Date }

/**
 * Live "when was master data last refreshed" presentation for the More
 * page (Phase 18 §9), read from the same Phase 16 `masterDataCache` the
 * Start screen consults. `refresh()` re-reads the cache — callers invoke
 * it after a successful Apps Script master-data refresh so the
 * displayed timestamp reflects the write that just happened.
 */
export function useMasterDataCacheStatus(cache: MasterDataCacheStore): [MasterDataCacheStatus, () => void] {
  const [status, setStatus] = useState<MasterDataCacheStatus>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await cache.readCachedMasterData()
      if (cancelled) return
      if (result.ok && result.value) {
        setStatus({ kind: 'synced', fetchedAt: result.value.fetchedAt })
      } else {
        setStatus({ kind: 'never-synced' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [cache, reloadToken])

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  return [status, refresh]
}
