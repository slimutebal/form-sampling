import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useActiveShiftPresence } from '@/app/hooks/useActiveShiftPresence'
import { useOnlineStatus } from '@/app/hooks/useOnlineStatus'
import { usePwaUpdateState } from '@/app/hooks/usePwaUpdateState'
import { useShiftSummarySyncPresentation } from '@/app/hooks/useShiftSummarySyncPresentation'
import { pwaUpdateStore } from '@/app/startup/pwa-update-store'
import type { ShiftWorkspaceReader } from '@/application/ports/shift-workspace-reader'
import type { ShiftSummarySyncStatusReader } from '@/application/pwa/sync-presentation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'

export interface GlobalStatusBarProps {
  readonly syncReader: ShiftSummarySyncStatusReader
  readonly activeShiftReader: ShiftWorkspaceReader
}

/**
 * Compact, always-visible connectivity/sync/update status (ROADMAP Phase
 * 18 §11) rendered above the routed page content in `AppLayout`. Never
 * blocks operational screens: the update prompt only expands into a
 * dismissible panel, never a modal (Phase 18 §12). Takes its read ports as
 * props (mirrors the `ShiftStartPage`/`StartPage` composition-root
 * pattern) so it never depends on the `localOperationalStore` singleton
 * directly and stays testable with fakes.
 */
export function GlobalStatusBar({ syncReader, activeShiftReader }: GlobalStatusBarProps) {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const sync = useShiftSummarySyncPresentation(syncReader)
  const pwaState = usePwaUpdateState()
  const hasActiveShift = useActiveShiftPresence(activeShiftReader)
  // Seeded from the store's `dismissed` flag so a prior "Update Later" stays
  // collapsed to the compact pill across remounts, not just within one.
  const [updateExpanded, setUpdateExpanded] = useState(() => !pwaState.dismissed)
  const [applying, setApplying] = useState(false)
  const [offlineReadyDismissed, setOfflineReadyDismissed] = useState(false)

  const syncLabel =
    sync.status === 'SYNC_FAILED'
      ? t('sync.failedCount', { count: sync.failedCount })
      : sync.status === 'SYNC_PENDING'
        ? t('sync.pendingCount', { count: sync.pendingCount })
        : sync.status === 'SYNCING'
          ? t('sync.syncing')
          : t('sync.allSynced')

  const SyncIcon =
    sync.status === 'SYNC_FAILED'
      ? AlertTriangle
      : sync.status === 'SYNC_PENDING'
        ? Clock
        : sync.status === 'SYNCING'
          ? Loader2
          : CheckCircle2

  async function handleApplyUpdate() {
    setApplying(true)
    await pwaUpdateStore.applyUpdate()
  }

  function handleDismiss() {
    pwaUpdateStore.dismissUpdate()
    setUpdateExpanded(false)
  }

  const isNormal = online && sync.status === 'ALL_SYNCED'

  return (
    <div className={cn('safe-top safe-x border-b border-border bg-muted/60 text-xs', isNormal && 'bg-background')}>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-5', isNormal ? 'py-1' : 'py-1.5')}>
        <span
          className={cn('flex items-center gap-1 font-medium', online ? 'text-muted-foreground' : 'text-amber-700')}
        >
          {online ? <Wifi aria-hidden="true" size={14} /> : <WifiOff aria-hidden="true" size={14} />}
          {online ? t('pwa.online') : t('pwa.offline')}
        </span>

        <span aria-hidden="true" className="text-muted-foreground">·</span>

        <span
          className={cn(
            'flex items-center gap-1 font-medium',
            sync.status === 'SYNC_FAILED' ? 'text-red-600' : sync.status === 'SYNC_PENDING' ? 'text-amber-700' : 'text-muted-foreground',
          )}
        >
          <SyncIcon aria-hidden="true" size={14} className={sync.status === 'SYNCING' ? 'animate-spin' : undefined} />
          {syncLabel}
        </span>

        {pwaState.needRefresh && (
          <button
            type="button"
            onClick={() => setUpdateExpanded((value) => !value)}
            aria-expanded={updateExpanded}
            className="ml-auto flex min-h-6 items-center gap-1 font-medium text-primary"
          >
            <RefreshCw aria-hidden="true" size={14} />
            {t('pwa.updateAvailable')}
          </button>
        )}
      </div>

      {!online && <p className="px-5 pb-1.5 text-muted-foreground">{t('pwa.offlineSavedLocally')}</p>}

      {pwaState.offlineReady && !offlineReadyDismissed && (
        <p className="flex items-center justify-between gap-2 px-5 pb-1.5 text-muted-foreground">
          <span>{t('pwa.offlineReady')}</span>
          <button
            type="button"
            aria-label={t('pwa.dismiss')}
            onClick={() => setOfflineReadyDismissed(true)}
            className="shrink-0"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </p>
      )}

      {pwaState.needRefresh && updateExpanded && (
        <Card className="mx-3 mb-2 rounded-md p-3">
          <CardContent className="flex flex-col gap-2 p-0 text-sm">
            <p className="font-medium text-foreground">{t('pwa.updateAvailable')}</p>
            <p className="text-muted-foreground">{t('pwa.updateAvailableDetail')}</p>
            {hasActiveShift && <p className="text-muted-foreground">{t('pwa.updateActiveShiftNotice')}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={hasActiveShift ? 'primary' : 'secondary'}
                size="default"
                onClick={handleDismiss}
              >
                {t('pwa.updateLater')}
              </Button>
              <Button
                type="button"
                variant={hasActiveShift ? 'secondary' : 'primary'}
                size="default"
                disabled={applying}
                onClick={() => void handleApplyUpdate()}
              >
                {applying ? t('pwa.updating') : t('pwa.updateNow')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
