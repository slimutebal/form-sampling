import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker without forcing a reload on update.
 * Update UX (prompting the user) is deferred to the PWA hardening phase.
 */
export function registerPwa() {
  if (import.meta.env.PROD) {
    registerSW({ immediate: true })
  }
}
