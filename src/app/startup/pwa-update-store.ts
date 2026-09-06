/**
 * Application-facing PWA update state boundary (ROADMAP Phase 18 §6/§7).
 * Nothing outside `src/app/startup/**` talks to `virtual:pwa-register`
 * directly — `registerPwa` is the only writer, everything else (the global
 * status UI) only ever reads this store or calls its safe actions.
 *
 * CRITICAL: `applyUpdate()` is the only path that can ever trigger a
 * service-worker update/reload, and it only runs when explicitly called —
 * never automatically. `dismissUpdate()` never touches the service worker;
 * it only clears the "should present prominently" flag so a dismissed
 * update can still surface again as a compact status (Phase 18 §12)
 * instead of vanishing outright.
 */
export interface PwaUpdateSnapshot {
  readonly needRefresh: boolean
  readonly offlineReady: boolean
  /** True once the user has dismissed the current `needRefresh` prompt. Reset whenever a fresh update is detected. */
  readonly dismissed: boolean
}

type Listener = () => void

const initialSnapshot: PwaUpdateSnapshot = {
  needRefresh: false,
  offlineReady: false,
  dismissed: false,
}

class PwaUpdateStore {
  private snapshot: PwaUpdateSnapshot = initialSnapshot
  private readonly listeners = new Set<Listener>()
  private updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PwaUpdateSnapshot => this.snapshot

  private commit(next: Partial<PwaUpdateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) {
      listener()
    }
  }

  /** Called only from `registerPwa`'s `onNeedRefresh` callback. */
  setNeedRefresh(needRefresh: boolean): void {
    this.commit({ needRefresh, dismissed: needRefresh ? false : this.snapshot.dismissed })
  }

  /** Called only from `registerPwa`'s `onOfflineReady` callback. */
  setOfflineReady(offlineReady: boolean): void {
    this.commit({ offlineReady })
  }

  /** Called only from `registerPwa`, once `registerSW` returns its updater function. */
  setUpdater(updater: ((reloadPage?: boolean) => Promise<void>) | undefined): void {
    this.updateServiceWorker = updater
  }

  /**
   * The only safe path to an explicit update. Never invoked automatically —
   * only from a direct user action (e.g. tapping "Update Now"). A no-op if
   * no service worker registration is active (dev/test, or registration
   * failed).
   */
  async applyUpdate(): Promise<void> {
    if (!this.updateServiceWorker) {
      return
    }
    await this.updateServiceWorker(true)
  }

  /** Collapses the prominent prompt without ever touching the service worker. */
  dismissUpdate(): void {
    this.commit({ dismissed: true })
  }
}

export const pwaUpdateStore = new PwaUpdateStore()
