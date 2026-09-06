import { useSyncExternalStore } from 'react'
import { pwaUpdateStore, type PwaUpdateSnapshot } from '@/app/startup/pwa-update-store'

/** Live PWA update/offline-ready state (ROADMAP Phase 18 §6), read-only — mutate only via `pwaUpdateStore.applyUpdate()`/`dismissUpdate()`. */
export function usePwaUpdateState(): PwaUpdateSnapshot {
  return useSyncExternalStore(pwaUpdateStore.subscribe, pwaUpdateStore.getSnapshot)
}
