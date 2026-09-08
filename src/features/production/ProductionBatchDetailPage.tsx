import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { deriveProductionBatchSummaries } from '@/application/production/production-batch-summary'
import { deriveProductionRitViews } from '@/application/production/production-rit-view'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import type { ProductionRecord } from '@/domain/production/production-record'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

/**
 * The Batch Detail + Ritase List screen (Phase 3 §6/§7). Header always
 * uses the full "{Pile_ID} Batch {N}" text — never abbreviated as "B4".
 * Every Ritase row represents one effective Rit *position*
 * (`deriveProductionRitViews`), not one transaction row: a position with
 * only REJECT attempts and a later accepted Rit renders as MISSED,
 * never as a duplicate production slot.
 */
export function ProductionBatchDetailPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId, batchNumber: batchNumberParam } = useParams<{ pileId: string; batchNumber: string }>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const batchNumberResult = parseBatchNumber(Number(batchNumberParam))
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
    if (!pile) return
    let cancelled = false
    void localOperationalStore.listProductionRecordsForShift(workspace.shift.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', productionRecords: result.value } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [pile, workspace.shift.id])

  const batchNumber = batchNumberResult.ok ? batchNumberResult.value : undefined

  const batchSummaryResult = useMemo(() => {
    if (phase.kind !== 'loaded' || !pile) return undefined
    return deriveProductionBatchSummaries(pile, workspace.masterData, phase.productionRecords, workspace.pendingBatches)
  }, [phase, pile, workspace.masterData, workspace.pendingBatches])

  const batchSummary =
    batchSummaryResult && batchSummaryResult.ok && batchNumber
      ? batchSummaryResult.value.find((summary) => Number(summary.batchNumber) === Number(batchNumber))
      : undefined

  const ritViews = useMemo(() => {
    if (phase.kind !== 'loaded' || !pile || !batchNumber || !batchSummary) return []
    // The Ritase list must scan this Batch's own authoritative expected
    // Rits (carry-over/fresh-start-aware), never an invented `1..N`
    // range — `batchSummary.batchSize` is already resolved, so this
    // never re-triggers an Ore-config lookup.
    const expectedRitsResult = deriveExpectedRitsForBatch(
      pile,
      batchSummary.batchSize,
      workspace.pendingBatches,
      batchNumber,
      pile.freshPileStartPosition,
    )
    if (!expectedRitsResult.ok) return []
    return deriveProductionRitViews(phase.productionRecords, pile.id, batchNumber, expectedRitsResult.value)
  }, [phase, pile, batchNumber, batchSummary, workspace.pendingBatches])

  if (!pile || !batchNumberResult.ok) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t(pile ? 'batch.notFound' : 'errors.pileNotFound')}
          </p>
        </div>
      </div>
    )
  }

  const headerTitle = t('batch.headerTitle', { pileId: pile.id, batchNumber: Number(batchNumber) })

  return (
    <div>
      <PageHeader title={headerTitle} />
      <div className="flex flex-col gap-3 px-5 py-4">
        {phase.kind === 'error' ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('batch.errors.loadFailed')}
          </p>
        ) : null}

        {batchSummaryResult && !batchSummaryResult.ok ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('batch.errors.samplingConfigMissing')}
          </p>
        ) : null}

        {phase.kind === 'loaded' && batchSummaryResult?.ok && !batchSummary ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('batch.notFound')}
          </p>
        ) : null}

        {batchSummary ? (
          <Card>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.status')}</span>
                <span className="font-semibold">{t(`batch.statusOptions.${batchSummary.status}`)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.material')}</span>
                <span className="font-semibold">{pile.oreCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.capacity')}</span>
                <span className="font-semibold">{t('batch.capacityValue', { size: Number(batchSummary.batchSize) })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.progress')}</span>
                <span className="font-semibold">
                  {t('batch.progressValue', {
                    accepted: batchSummary.acceptRitCount,
                    size: Number(batchSummary.batchSize),
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.reject')}</span>
                <span className="font-semibold">{batchSummary.rejectCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.sample')}</span>
                <span className="font-semibold">{batchSummary.sampleCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('batch.wrongTruck')}</span>
                <span className="font-semibold">{batchSummary.wrongTruckCount}</span>
              </div>
              {batchSummary.missedRits.length > 0 ? (
                <p className="font-semibold text-amber-700">
                  {t('batch.missedRit', { rits: batchSummary.missedRits.map((rit) => Number(rit)).join(', ') })}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <p className="mt-1 text-sm font-semibold">{t('batch.ritaseTitle')}</p>

        {phase.kind === 'loaded' && ritViews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('batch.empty')}</p>
        ) : null}

        {ritViews.map((view) => {
          const ritLabel = String(Number(view.ritNumber)).padStart(2, '0')
          const linkTo = `/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batchNumber)}/rit/${Number(view.ritNumber)}`

          if (view.missed) {
            return (
              <Link key={Number(view.ritNumber)} to={linkTo} className="block">
                <Card>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-muted-foreground">{ritLabel}</span>
                    <span className="flex-1 text-sm font-semibold text-amber-700">
                      ⚠ {t('batch.missedLabel')}
                    </span>
                    <ChevronRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={18} />
                  </CardContent>
                </Card>
              </Link>
            )
          }

          const record = view.acceptedRecord
          return (
            <Link key={Number(view.ritNumber)} to={linkTo} className="block">
              <Card>
                <CardContent className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">{ritLabel}</span>
                  {record ? (
                    <span className="flex-1 truncate text-sm">
                      <span className="font-medium">{record.effective.truckId}</span>{' '}
                      <span className="font-semibold">{t(`record.dispositionOptions.${record.effective.disposition}`)}</span>{' '}
                      {record.effective.contamination ? <span>{record.effective.contamination}</span> : null}{' '}
                      {record.transaction.samplingEvaluation.sampleRequired ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          {t('batch.sampleTag')}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex-1 text-sm text-muted-foreground">
                      {view.rejectAttempts.length > 0 ? view.rejectAttempts[view.rejectAttempts.length - 1]!.effective.truckId : ''}
                    </span>
                  )}
                  <ChevronRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={18} />
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
