import { useTranslation } from 'react-i18next'
import type { RecordedHaulagePosition } from '@/application/haulage-operation/derive-haulage-progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RecordedHaulageListProps {
  recordedPositions: readonly RecordedHaulagePosition[]
}

/**
 * Compact recorded-position history (docs/ROADMAP.md Phase 10 §27).
 * Ordered by the authoritative expectedPositions plan order — never by
 * IndexedDB return order, which carries no operational meaning. A
 * position with more than one recorded transaction lists every one of
 * them without guessing which "replaces" another (no correction UI).
 */
export function RecordedHaulageList({ recordedPositions }: RecordedHaulageListProps) {
  const { t } = useTranslation()
  if (recordedPositions.length === 0) {
    return null
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pileHaulage.recordedPositions')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {recordedPositions.map(({ position, transactions }) => (
            <li
              key={`${Number(position.batchNumber)}/${Number(position.ritNumber)}`}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {t('pileHaulage.batch')} {Number(position.batchNumber)} • {t('pileHaulage.rit')}{' '}
                  {Number(position.ritNumber)}
                </p>
                <span className="text-sm font-medium text-emerald-700">{t('pileHaulage.recorded')}</span>
              </div>
              <ul className="flex flex-col gap-0.5 pl-2 text-sm text-muted-foreground">
                {transactions.map((transaction) => (
                  <li key={transaction.id}>{transaction.truckId}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
