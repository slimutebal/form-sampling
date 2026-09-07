import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly transactions: readonly HaulageTransaction[] }

export function ProductionPileDetailPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId } = useParams<{ pileId: string }>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
    if (!pile) return
    let cancelled = false
    void localOperationalStore.listHaulageTransactionsForShiftPile(workspace.shift.id, pile.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', transactions: result.value } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [pile, workspace.shift.id])

  const batches = useMemo(() => {
    if (phase.kind !== 'loaded') return []
    const byBatch = new Map<number, HaulageTransaction[]>()
    for (const transaction of phase.transactions) {
      const batch = Number(transaction.batchPosition.batchNumber)
      const list = byBatch.get(batch)
      if (list) list.push(transaction)
      else byBatch.set(batch, [transaction])
    }
    return [...byBatch.entries()].sort(([a], [b]) => a - b)
  }, [phase])

  if (!pile) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">{t('errors.pileNotFound')}</p>
        </div>
      </div>
    )
  }

  const transactions = phase.kind === 'loaded' ? phase.transactions : []
  const sampleTotal = transactions.filter((transaction) => transaction.samplingEvaluation.sampleRequired).length
  const wrongTruck = transactions.filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK').length
  const pendingSample = workspace.pendingSamples.filter((sample) => sample.pileId === pile.id).length

  return (
    <div>
      <PageHeader title={t('detail.title', { pileId: pile.id })} />
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{pile.id}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pile.oreCode}</span>
        </div>

        {phase.kind === 'error' ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t('errors.loadFailed')}</p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.batchTotal')}</p><p className="text-lg font-bold">{batches.length}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.ritAccept')}</p><p className="text-lg font-bold">{transactions.length}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.ritReject')}</p><p className="text-lg font-bold">{t('legacy.rejectUnavailable')}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.wrongTruck')}</p><p className="text-lg font-bold">{wrongTruck}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.sampleTotal')}</p><p className="text-lg font-bold">{sampleTotal}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">{t('detail.pendingSample')}</p><p className="text-lg font-bold">{pendingSample}</p></CardContent></Card>
        </div>

        <p className="mt-1 text-sm font-semibold">Batch</p>
        {phase.kind === 'loaded' && batches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('detail.empty')}</p>
        ) : null}
        {batches.map(([batchNumber, rows]) => {
          const sampleCount = rows.filter((transaction) => transaction.samplingEvaluation.sampleRequired).length
          const batchWrongTruck = rows.filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK').length
          const maxRit = rows.reduce((max, transaction) => Math.max(max, Number(transaction.batchPosition.ritNumber)), 0)
          return (
            <Card key={batchNumber}>
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Batch {batchNumber}</p>
                  <p className="text-xs text-muted-foreground">Rit {maxRit} · Sample {sampleCount} · Wrong Truck {batchWrongTruck}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Active</span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
