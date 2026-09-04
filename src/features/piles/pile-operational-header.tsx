import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { BatchSize } from '@/domain/master/sampling-config'
import type { Pile } from '@/domain/pile/pile'
import type { SamplingEvaluation } from '@/domain/sampling/sampling-engine'

interface PileOperationalHeaderProps {
  pile: Pile
  nextPosition: BatchPosition
  batchSize: BatchSize
  samplingEvaluation: SamplingEvaluation
}

/**
 * Operational visual priority for the Pile Haulage screen
 * (docs/UI_UX_SPEC.md §9): Pile ID first, Next Rit and Sample status
 * prominent, Batch visible but secondary. Meaning is never carried by
 * color alone — every status has text.
 */
export function PileOperationalHeader({ pile, nextPosition, batchSize, samplingEvaluation }: PileOperationalHeaderProps) {
  const { t } = useTranslation()
  const rit = Number(nextPosition.ritNumber)
  const batch = Number(nextPosition.batchNumber)
  const size = Number(batchSize)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('pileHaulage.title')}
          </p>
          <p className="break-all text-2xl font-bold">{pile.id}</p>
          <p className="text-sm text-muted-foreground">
            {t('pileHaulage.ore')}: {pile.oreCode}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('pileHaulage.batch')}
            </p>
            <p className="text-2xl font-bold">{batch}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('pileHaulage.nextRit')}
            </p>
            <p className="text-2xl font-bold">
              {rit} / {size}
            </p>
          </div>
        </div>

        {samplingEvaluation.sampleRequired ? (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-lg font-bold text-amber-900">{t('pileHaulage.sampleRequired')}</p>
            <p className="text-sm text-amber-800">
              {t('pileHaulage.increment')} {String(Number(samplingEvaluation.incrementNumber)).padStart(2, '0')}
            </p>
          </div>
        ) : (
          <div role="status" className="rounded-md border border-border bg-muted p-3">
            <p className="text-lg font-semibold">{t('pileHaulage.noSample')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
