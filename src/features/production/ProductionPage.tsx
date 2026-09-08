import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import { deriveProductionBatchSummaries } from '@/application/production/production-batch-summary'
import { deriveProductionPileSummary, type ProductionPileSummary } from '@/application/production/production-pile-summary'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

const TAB_VALUES = ['detail', 'record'] as const
type ProductionTab = (typeof TAB_VALUES)[number]

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'loaded'
      readonly productionRecords: readonly ProductionRecord[]
      readonly samplePositions: readonly SamplePosition[]
    }

function isProductionTab(value: string | null): value is ProductionTab {
  return value === 'detail' || value === 'record'
}

export function ProductionPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab: ProductionTab = isProductionTab(requestedTab) ? requestedTab : 'record'
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
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
  }, [workspace.shift.id])

  const normalizedQuery = query.trim().toLowerCase()
  const visiblePiles = useMemo(
    () =>
      workspace.piles.filter((pile) =>
        normalizedQuery.length === 0 ? true : (pile.id as string).toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, workspace.piles],
  )

  const pileSummaries = useMemo((): ReadonlyMap<string, ProductionPileSummary> => {
    if (phase.kind !== 'loaded' || activeTab !== 'detail') {
      return new Map()
    }
    const pendingSamplePiles = derivePendingSamples({
      shiftId: workspace.shift.id,
      piles: workspace.piles,
      haulageTransactions: selectEffectiveTransactions(phase.productionRecords),
      samplePositions: phase.samplePositions,
    })
    return new Map(
      workspace.piles.map((pile) => {
        // A batch-summary failure (e.g. missing Ore sampling config) is
        // degraded to "no missed-Rit info" for this landing card rather
        // than blocking the whole Detail tab — the dedicated Pile Detail
        // screen surfaces the real error.
        const batchSummariesResult = deriveProductionBatchSummaries(
          pile,
          workspace.masterData,
          phase.productionRecords,
          workspace.pendingBatches,
        )
        const batchSummaries = batchSummariesResult.ok ? batchSummariesResult.value : []
        return [
          pile.id as string,
          deriveProductionPileSummary(pile, phase.productionRecords, pendingSamplePiles, batchSummaries),
        ]
      }),
    )
  }, [phase, activeTab, workspace.shift.id, workspace.piles, workspace.masterData, workspace.pendingBatches])

  function switchTab(tab: ProductionTab) {
    setSearchParams({ tab })
  }

  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="flex flex-col gap-3 px-5 py-4 pb-36">
        {phase.kind === 'error' ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('errors.loadFailed')}
          </p>
        ) : null}

        <p className="text-sm font-semibold text-foreground">
          {activeTab === 'record' ? t('record.choosePile') : t('detail.choosePile')}
        </p>

        {visiblePiles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {activeTab === 'record' ? t('record.empty') : t('detail.empty')}
          </p>
        ) : (
          visiblePiles.map((pile) => {
            const summary = pileSummaries.get(pile.id as string)

            return (
              <Link
                key={pile.id}
                to={
                  activeTab === 'record'
                    ? `/production/record/${encodeURIComponent(pile.id as string)}`
                    : `/production/detail/${encodeURIComponent(pile.id as string)}`
                }
                className="block"
              >
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold">{pile.id}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {pile.oreCode}
                          </span>
                        </div>
                        {activeTab === 'detail' && summary && summary.missedBatchNumbers.length > 0 ? (
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            {t('detail.cardMissedInline', {
                              batches: summary.missedBatchNumbers.map((batch) => Number(batch)).join(', '),
                            })}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight aria-hidden="true" className="shrink-0 self-start text-muted-foreground" size={20} />
                    </div>

                    {activeTab === 'detail' && summary ? (
                      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-semibold text-foreground">{t('detail.batch')}</p>
                          <p>
                            {t('detail.total')}: {summary.batchTotal}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{t('detail.ritase')}</p>
                          <p>
                            {t('detail.accept')}: {summary.acceptRitCount}
                          </p>
                          <p>
                            {t('detail.reject')}: {summary.rejectCount}
                          </p>
                          <p>
                            {t('detail.wrongTruck')}: {summary.wrongTruckCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{t('detail.sample')}</p>
                          <p>
                            {t('detail.total')}: {summary.sampleTotal}
                          </p>
                          <p>
                            {t('detail.pendingSample')}: {summary.pendingSampleCount}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[9] safe-x mx-auto w-full max-w-md border-t border-border bg-background/95 px-5 py-2 shadow-[0_-2px_10px_rgba(15,23,42,0.05)] backdrop-blur">
        <label className="relative block">
          <span className="sr-only">{t('search.label')}</span>
          <Search aria-hidden="true" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-muted/40 p-1">
          {TAB_VALUES.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className={cn(
                'h-10 rounded-md text-sm font-semibold transition-colors',
                activeTab === tab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
