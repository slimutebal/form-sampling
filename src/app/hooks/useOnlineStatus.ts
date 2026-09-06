import { useSyncExternalStore } from 'react'
import { isOnline, subscribeToConnectivity } from '@/infrastructure/device/connectivity'

function subscribe(onStoreChange: () => void): () => void {
  return subscribeToConnectivity(() => onStoreChange())
}

/** Live ONLINE/OFFLINE UI state (ROADMAP Phase 18 §9), backed by `navigator.onLine` and the `online`/`offline` window events. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true)
}
