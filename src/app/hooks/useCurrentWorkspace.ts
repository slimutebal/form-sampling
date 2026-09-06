import { useCallback, useEffect, useState } from 'react'
import type { LocalDatabaseError, LocalOperationalStore, LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'

export type CurrentWorkspacePhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: LocalDatabaseError }
  | { readonly kind: 'none' }
  | { readonly kind: 'loaded'; readonly workspace: LocalShiftWorkspace }

/**
 * Loads the current local Shift workspace (Phase 18 wiring correction
 * §15/§16) — the one read every active route (`/home`, `/piles`,
 * `/piles/:pileId`, `/samples`, `/report`) and the `AppLayout` route
 * guard need. Deliberately a plain local read via
 * `LocalOperationalStore.loadCurrentShiftWorkspace` (mirrors
 * `ShiftStartPage`'s own loading pattern) rather than a shared context —
 * this app has no global state layer, and each read is a cheap local
 * IndexedDB lookup.
 *
 * Returns `[phase, retry]`: `retry` resets to `'loading'` and re-runs the
 * read — the reset happens in this callback, not inside the effect body
 * itself (mirrors `ShiftStartPage`'s own `handleRetry`), since resetting
 * state synchronously from inside an effect risks cascading renders.
 */
export function useCurrentWorkspace(
  store: Pick<LocalOperationalStore, 'loadCurrentShiftWorkspace'>,
): readonly [CurrentWorkspacePhase, () => void] {
  const [phase, setPhase] = useState<CurrentWorkspacePhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    void store.loadCurrentShiftWorkspace().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setPhase({ kind: 'error', error: result.error })
        return
      }
      setPhase(result.value ? { kind: 'loaded', workspace: result.value } : { kind: 'none' })
    })

    return () => {
      cancelled = true
    }
  }, [store, reloadToken])

  const retry = useCallback(() => {
    setPhase({ kind: 'loading' })
    setReloadToken((token) => token + 1)
  }, [])

  return [phase, retry] as const
}
