import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { parseHaulageTransactionId } from '@/domain/common/identifiers'
import type { ProductionRecord } from '@/domain/production/production-record'
import { buildCorrectionHistory } from '@/features/production/production-correction-history'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function formatCorrectedAt(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = MONTH_ABBREVIATIONS[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} • ${hours}:${minutes}`
}

/**
 * Riwayat Koreksi (Phase 4 §22/§23) — the correction history for one
 * specific ProductionRecord, latest first, showing only the fields that
 * actually changed between each correction's before/after snapshot. Never
 * dumps a raw JSON snapshot. Reached only from a record that already has
 * `audit.corrections.length > 0` (the `[ Riwayat Koreksi ]` link on
 * `ProductionRitDetailPage`).
 */
export function ProductionCorrectionsPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId, batchNumber, ritNumber } = useParams<{ pileId: string; batchNumber: string; ritNumber: string }>()
  const [searchParams] = useSearchParams()
  const transactionIdParam = searchParams.get('tx') ?? ''
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.listProductionRecordsForShift(workspace.shift.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', productionRecords: result.value } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shift.id])

  const headerTitle = t('corrections.headerTitle', {
    pileId: pileId ?? '',
    batchNumber: Number(batchNumber),
    ritNumber: Number(ritNumber),
  })

  const transactionIdResult = parseHaulageTransactionId(transactionIdParam)
  const record =
    phase.kind === 'loaded' && transactionIdResult.ok
      ? phase.productionRecords.find((candidate) => candidate.transaction.id === transactionIdResult.value)
      : undefined

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('detail.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error' || !record) {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t('corrections.notFound')}
          </p>
        </div>
      </div>
    )
  }

  const history = buildCorrectionHistory(record.audit.corrections)

  return (
    <div>
      <PageHeader title={headerTitle} />
      <div className="flex flex-col gap-3 px-5 py-4">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('corrections.empty')}</p>
        ) : (
          history.map((entry, index) => (
            <Card key={entry.correction.id as string}>
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatCorrectedAt(entry.correction.correctedAt)}
                </p>
                <p className="text-sm font-bold">{t(`corrections.types.${entry.correction.type}`)}</p>
                <p className="text-sm text-muted-foreground">
                  {t('corrections.by', { correctedBy: entry.correction.correctedBy })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('corrections.reason', { reason: entry.correction.reason })}
                </p>
                {entry.changes.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
                    {entry.changes.map((change) => (
                      <div key={change.field} className="flex flex-col gap-0.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(`corrections.fields.${change.field}`)}
                        </p>
                        <p className="text-sm font-semibold">
                          {change.before} → {change.after}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {index < history.length - 1 ? <div className="mt-1 border-b border-dashed border-border" /> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
