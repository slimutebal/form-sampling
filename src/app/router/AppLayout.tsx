import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { useCurrentWorkspace } from '@/app/hooks/useCurrentWorkspace'
import { BottomNav } from '@/components/shared/BottomNav'
import { GlobalStatusBar } from '@/components/shared/GlobalStatusBar'
import { SafeAreaTopCap } from '@/components/shared/SafeAreaTopCap'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'

/** The active-shell page context every route nested under `AppLayout` reads via `useOutletContext<ActiveWorkspaceContext>()`. */
export interface ActiveWorkspaceContext {
  readonly workspace: LocalShiftWorkspace
  /** Re-reads the workspace from `LocalOperationalStore` (Phase 18 "Add Pile" correction) — call after a write that changes the stored workspace (e.g. `addPileToWorkspace`) so every page sharing this context observes the fresh state, not a stale copy. */
  readonly refreshWorkspace: () => void
}

/**
 * The active application shell (Phase 18 wiring correction §9/§15/§16):
 * every route nested here (`/home`, `/piles`, `/piles/:pileId`,
 * `/samples`, `/report`, `/more`) requires an active local Shift
 * workspace. Loaded once, here, and handed down via Outlet context so
 * no nested page re-implements its own workspace-presence guard —
 * `/start` is the only legitimate entry point for a missing workspace,
 * so a missing workspace here redirects there rather than rendering a
 * broken active screen. A load failure shows a localized blocking/retry
 * state and never clears any stored data.
 */
export function AppLayout() {
  const { t } = useTranslation()
  const [phase, handleRetry] = useCurrentWorkspace(localOperationalStore)

  return (
    <div className="safe-x mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <SafeAreaTopCap />
      <GlobalStatusBar syncReader={localOperationalStore} activeShiftReader={localOperationalStore} />
      <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {phase.kind === 'loading' ? (
          <div className="px-5 py-4" aria-live="polite">
            <p className="text-sm text-muted-foreground">{t('activeShell.loading')}</p>
          </div>
        ) : null}

        {phase.kind === 'error' ? (
          <div className="px-5 py-4">
            <Card>
              <CardContent role="alert" className="flex flex-col gap-3">
                <p>{t('activeShell.errors.loadFailed')}</p>
                <Button type="button" onClick={handleRetry}>
                  {t('shiftStart.errors.retry')}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {phase.kind === 'none' ? <Navigate to="/start" replace /> : null}

        {phase.kind === 'loaded' ? (
          <Outlet
            context={{ workspace: phase.workspace, refreshWorkspace: handleRetry } satisfies ActiveWorkspaceContext}
          />
        ) : null}
      </main>
      <BottomNav />
    </div>
  )
}
