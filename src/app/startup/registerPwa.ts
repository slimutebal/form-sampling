import { registerSW } from 'virtual:pwa-register'
import { pwaUpdateStore } from '@/app/startup/pwa-update-store'

/**
 * Registers the service worker (production builds only) and wires its
 * update/offline-ready signals into `pwaUpdateStore` — the only writer of
 * that store. `registerType: 'prompt'` (vite.config.ts) means the
 * generated service worker never calls `skipWaiting`/`clients.claim` on
 * its own; the new worker only activates when `pwaUpdateStore.applyUpdate()`
 * is explicitly called (ROADMAP Phase 18 §7).
 */
export function registerPwa(): void {
  if (!import.meta.env.PROD) {
    return
  }

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      pwaUpdateStore.setNeedRefresh(true)
    },
    onOfflineReady() {
      pwaUpdateStore.setOfflineReady(true)
    },
  })
  pwaUpdateStore.setUpdater(updateServiceWorker)
}
