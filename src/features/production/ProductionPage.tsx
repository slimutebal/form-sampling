import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'

const TAB_VALUES = ['detail', 'record'] as const
type ProductionTab = (typeof TAB_VALUES)[number]

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly transactions: readonly HaulageTransaction[] }

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
    void localOperationalStore.listHaulageTransactionsForShift(workspace.shift.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', transactions: result.value } : { kind: 'error' })
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

  const transactions = phase.kind === 'loaded' ? phase.transactions : []

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
            const pileTransactions = transactions.filter((transaction) => transaction.pileId === pile.id)
            const batchTotal = new Set(pileTransactions.map((transaction) => Number(transaction.batchPosition.batchNumber))).size
            const sampleTotal = pileTransactions.filter((transaction) => transaction.samplingEvaluation.sampleRequired).length
            const wrongTruck = pileTransactions.filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK').length
            const pendingSample = workspace.pendingSamples.filter((sample) => sample.pileId === pile.id).length

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
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-semibold">{pile.id}</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {pile.oreCode}
                        </span>
                      </div>

                      {activeTab === 'detail' ? (
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{t('detail.batchTotal')}: {batchTotal}</span>
                          <span>{t('detail.ritAccept')}: {pileTransactions.length}</span>
                          <span>{t('detail.ritReject')}: {t('legacy.rejectUnavailable')}</span>
                          <span>{t('detail.wrongTruck')}: {wrongTruck}</span>
                          <span>{t('detail.sampleTotal')}: {sampleTotal}</span>
                          <span>{t('detail.pendingSample')}: {pendingSample}</span>
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={20} />
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
