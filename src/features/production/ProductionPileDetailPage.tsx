import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import {
  deriveProductionBatchSummaries,
  selectMissedBatches,
  type ProductionBatchStatus,
} from '@/application/production/production-batch-summary'
import { deriveProductionPileSummary } from '@/application/production/production-pile-summary'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'loaded'
      readonly productionRecords: readonly ProductionRecord[]
      readonly samplePositions: readonly SamplePosition[]
    }

const STATUS_BADGE_CLASS: Readonly<Record<ProductionBatchStatus, string>> = {
  ACTIVE: 'bg-primary/10 text-primary',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-muted text-muted-foreground',
}

function batchAnchorId(batchNumber: number): string {
  return `batch-${batchNumber}`
}

/**
 * The Selected Pile Detail screen (Phase 3 §4/§5): no bottom Detail/
 * Record submenu, no Pile search box (this is a distinct route from
 * `ProductionPage`'s landing). Every count is derived from the Phase 3
 * projection functions (`deriveProductionPileSummary`,
 * `deriveProductionBatchSummaries`, `selectMissedBatches`) — never
 * calculated ad hoc here.
 */
export function ProductionPileDetailPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId } = useParams<{ pileId: string }>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
    if (!pile) return
    let cancelled = false
    void Promise.all([
      localOperationalStore.listProductionRecordsForShift(workspace.shift.id),
      localOperationalStore.listSamplePositionsForShift(workspace.shift.id),
    ]).then(([productionRecordResult, samplePositionResult]) => {
      if (cancelled) return
      if (!productionRecordResult.ok || !samplePositionResult.ok) {
        setPhase({ kind: 'error' })
        return
      }
      setPhase({
        kind: 'loaded',
        productionRecords: productionRecordResult.value,
        samplePositions: samplePositionResult.value,
      })
    })
    return () => {
      cancelled = true
    }
  }, [pile, workspace.shift.id])

  const batchSummariesResult = useMemo(() => {
    if (phase.kind !== 'loaded' || !pile) return undefined
    return deriveProductionBatchSummaries(pile, workspace.masterData, phase.productionRecords, workspace.pendingBatches)
  }, [phase, pile, workspace.masterData, workspace.pendingBatches])

  const missedBatches = useMemo(() => {
    if (!batchSummariesResult?.ok) return []
    return selectMissedBatches(batchSummariesResult.value)
  }, [batchSummariesResult])

  const summary = useMemo(() => {
    if (phase.kind !== 'loaded' || !pile) return undefined
    const pendingSamplePiles = derivePendingSamples({
      shiftId: workspace.shift.id,
      piles: [pile],
      haulageTransactions: selectEffectiveTransactions(phase.productionRecords),
      samplePositions: phase.samplePositions,
    })
    const batchSummaries = batchSummariesResult?.ok ? batchSummariesResult.value : []
    return deriveProductionPileSummary(pile, phase.productionRecords, pendingSamplePiles, batchSummaries)
  }, [phase, pile, workspace.shift.id, batchSummariesResult])

  function handleLihat() {
    if (missedBatches.length === 0) return
    const target = document.getElementById(batchAnchorId(Number(missedBatches[0]!.batchNumber)))
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  if (!pile) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t('errors.pileNotFound')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('detail.title', { pileId: pile.id })} />
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{pile.id}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pile.oreCode}</span>
        </div>

        {phase.kind === 'error' ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('errors.loadFailed')}
          </p>
        ) : null}

        {missedBatches.length > 0 ? (
          <Card className="border-amber-400 bg-amber-50">
            <CardContent className="flex flex-col gap-2">
              <p className="font-bold text-amber-900">{t('detail.warning.title')}</p>
              <div className="flex flex-col gap-0.5 text-sm text-amber-900">
                {missedBatches.map((batch) => (
                  <p key={Number(batch.batchNumber)}>
                    {t('detail.warning.lineItem', {
                      batch: Number(batch.batchNumber),
                      rits: batch.missedRits.map((rit) => Number(rit)).join(', '),
                    })}
                  </p>
                ))}
              </div>
              <Button type="button" variant="secondary" className="self-start" onClick={handleLihat}>
                {t('detail.warning.view')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {summary ? (
          <>
            <p className="mt-1 text-sm font-semibold">{t('detail.summaryTitle')}</p>
            <div className="grid grid-cols-3 gap-2">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.batchTotal')}</p>
                  <p className="text-lg font-bold">{summary.batchTotal}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.ritAccept')}</p>
                  <p className="text-lg font-bold">{summary.acceptRitCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.ritReject')}</p>
                  <p className="text-lg font-bold">{summary.rejectCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.wrongTruck')}</p>
                  <p className="text-lg font-bold">{summary.wrongTruckCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.sampleTotal')}</p>
                  <p className="text-lg font-bold">{summary.sampleTotal}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('detail.pendingSample')}</p>
                  <p className="text-lg font-bold">{summary.pendingSampleCount}</p>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        <p className="mt-1 text-sm font-semibold">{t('detail.batchSectionTitle')}</p>

        {batchSummariesResult && !batchSummariesResult.ok ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('detail.errors.samplingConfigMissing')}
          </p>
        ) : null}

        {batchSummariesResult && batchSummariesResult.ok && batchSummariesResult.value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('detail.empty')}</p>
        ) : null}

        {batchSummariesResult && batchSummariesResult.ok
          ? batchSummariesResult.value.map((batch) => (
              <Link
                key={Number(batch.batchNumber)}
                id={batchAnchorId(Number(batch.batchNumber))}
                to={`/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batch.batchNumber)}`}
                className="block scroll-mt-4"
              >
                <Card>
                  <CardContent className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        {t('detail.batchSectionTitle')} {Number(batch.batchNumber)}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-semibold',
                          STATUS_BADGE_CLASS[batch.status],
                        )}
                      >
                        {t(`batch.statusOptions.${batch.status}`)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {t('detail.ritAccept')}: {batch.acceptRitCount} / {Number(batch.batchSize)}
                      </span>
                      <span>
                        {t('detail.ritReject')}: {batch.rejectCount}
                      </span>
                      <span>
                        {t('detail.sample')}: {batch.sampleCount}
                      </span>
                      <span>
                        {t('detail.wrongTruck')}: {batch.wrongTruckCount}
                      </span>
                    </div>
                    {batch.missedRits.length > 0 ? (
                      <p className="text-xs font-semibold text-amber-700">
                        {t('batch.missedRit', { rits: batch.missedRits.map((rit) => Number(rit)).join(', ') })}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))
          : null}
      </div>
    </div>
  )
}
