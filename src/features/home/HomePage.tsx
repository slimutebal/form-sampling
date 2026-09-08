import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { refreshAppsScriptMasterData } from '@/app/google/google-master-data-sync'
import { localOperationalStore } from '@/app/local-operational-store'
import { useMasterDataCacheStatus } from '@/app/hooks/useMasterDataCacheStatus'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'
import type { SupportedLanguage } from '@/i18n'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'loaded'
      readonly haulageTransactions: readonly HaulageTransaction[]
      readonly productionRecords: readonly ProductionRecord[]
      readonly samplePositions: readonly SamplePosition[]
    }

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-[26px] font-semibold leading-tight">{value}</p>
      </CardContent>
    </Card>
  )
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [masterDataStatus, reloadMasterDataStatus] = useMasterDataCacheStatus(localOperationalStore)
  const [refreshPhase, setRefreshPhase] = useState<'idle' | 'refreshing' | 'error'>('idle')

  const handleRefreshMasterData = useCallback(async () => {
    if (refreshPhase === 'refreshing') return
    setRefreshPhase('refreshing')
    const result = await refreshAppsScriptMasterData()
    if (!result.ok) {
      setRefreshPhase('error')
      return
    }
    setRefreshPhase('idle')
    reloadMasterDataStatus()
  }, [refreshPhase, reloadMasterDataStatus])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      localOperationalStore.listHaulageTransactionsForShift(workspace.shift.id),
      localOperationalStore.listProductionRecordsForShift(workspace.shift.id),
      localOperationalStore.listSamplePositionsForShift(workspace.shift.id),
    ]).then(([haulageResult, productionRecordResult, sampleResult]) => {
      if (cancelled) return
      if (!haulageResult.ok || !productionRecordResult.ok || !sampleResult.ok) {
        setPhase({ kind: 'error' })
        return
      }
      setPhase({
        kind: 'loaded',
        haulageTransactions: haulageResult.value,
        productionRecords: productionRecordResult.value,
        samplePositions: sampleResult.value,
      })
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shift.id])

  const language = i18n.language as SupportedLanguage
  const pendingCount =
    phase.kind === 'loaded'
      ? derivePendingSamples({
          shiftId: workspace.shift.id,
          piles: workspace.piles,
          haulageTransactions: selectEffectiveTransactions(phase.productionRecords),
          samplePositions: phase.samplePositions,
        }).reduce(
          (total, pendingPile) =>
            total + pendingPile.batches.reduce((batchTotal, batch) => batchTotal + batch.pendingRitNumbers.length, 0),
          0,
        )
      : undefined
  const wrongTruckCount =
    phase.kind === 'loaded'
      ? phase.haulageTransactions.filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK').length
      : undefined

  return (
    <div>
      <PageHeader title={t('screens.home')} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {formatShiftDateForDisplay(workspace.shift.date, language)} · {workspace.shift.shiftCode}
            </p>
            <p className="text-base font-semibold">
              {workspace.shift.sectorCode} · {workspace.shift.samplingHouseCode}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-row items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {t('home.manpower.summary', {
                staffCount: workspace.manpower.filter((assignment) => assignment.isPic).length,
                crewCount: workspace.manpower.filter((assignment) => !assignment.isPic).length,
              })}
            </p>
            <Button asChild type="button" variant="secondary">
              <Link to="/manpower/edit">{t('home.manpower.edit')}</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatTile label={t('home.manpowerCount')} value={workspace.manpower.length} />
          <StatTile label={t('home.picCount')} value={workspace.manpower.filter((assignment) => assignment.isPic).length} />
          <StatTile label={t('home.activePiles')} value={workspace.piles.length} />
          <StatTile label={t('home.haulageCount')} value={phase.kind === 'loaded' ? phase.haulageTransactions.length : 0} />
          <StatTile label={t('home.pendingSamples')} value={pendingCount ?? 0} />
          <StatTile label={t('home.wrongTruckCount')} value={wrongTruckCount ?? 0} />
        </div>

        {phase.kind === 'error' ? (
          <p role="alert" className="text-sm text-red-600">
            {t('home.errors.loadFailed')}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button asChild type="button" size="lg">
            <Link to="/production?tab=record">{t('home.quickActions.inputDt')}</Link>
          </Button>
          <Button asChild type="button" size="lg" variant="secondary">
            <Link to="/samples">{t('home.quickActions.sampleHandling')}</Link>
          </Button>
          <Button asChild type="button" size="lg" variant="secondary">
            <Link to="/report">{t('home.quickActions.report')}</Link>
          </Button>
        </div>

        <Card>
          <CardTitle>{t('settings.language')}</CardTitle>
          <CardContent className="mt-3">
            <LanguageSwitcher />
          </CardContent>
        </Card>

        <Card>
          <CardTitle>{t('more.masterData.title')}</CardTitle>
          <CardContent className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {masterDataStatus.kind === 'synced'
                ? t('more.masterData.lastSynced', { timestamp: masterDataStatus.fetchedAt.toLocaleString(i18n.language) })
                : t('more.masterData.neverSynced')}
            </p>
            {refreshPhase === 'error' ? (
              <p role="alert" className="text-sm text-red-600">
                {t('more.masterData.refreshFailed')}
              </p>
            ) : null}
            <Button type="button" onClick={() => void handleRefreshMasterData()} disabled={refreshPhase === 'refreshing'}>
              {refreshPhase === 'refreshing' ? t('more.masterData.refreshing') : t('more.masterData.refresh')}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {t('more.applicationVersion')}: {__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}
