/**
 * Feature-detected browser connectivity adapter (ROADMAP Phase 18 §9).
 * `navigator.onLine` is only local network-interface connectivity, never
 * proof that any remote API (Google Sheets included) is reachable — callers
 * must not treat it as such.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export type ConnectivityListener = (online: boolean) => void

/**
 * Subscribes to the browser's `online`/`offline` window events. Returns an
 * unsubscribe function so callers (e.g. `useSyncExternalStore`) never leak
 * listeners across mount/unmount cycles.
 */
export function subscribeToConnectivity(listener: ConnectivityListener): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleOnline = () => listener(true)
  const handleOffline = () => listener(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
