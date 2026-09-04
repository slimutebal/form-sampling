import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BatchPosition } from '@/domain/batch/batch-position'

interface SkippedHaulageListProps {
  skippedPositions: readonly BatchPosition[]
}

/**
 * Displays BR-SKIP-001/002 skipped positions as an exception section
 * (docs/ROADMAP.md Phase 10 §26). No correction UI — reading this list
 * is the only interaction it offers.
 */
export function SkippedHaulageList({ skippedPositions }: SkippedHaulageListProps) {
  const { t } = useTranslation()
  if (skippedPositions.length === 0) {
    return null
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pileHaulage.skippedPositions')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {skippedPositions.map((position) => (
            <li
              key={`${Number(position.batchNumber)}/${Number(position.ritNumber)}`}
              className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2"
            >
              <span>
                {t('pileHaulage.batch')} {Number(position.batchNumber)} • {t('pileHaulage.rit')}{' '}
                {Number(position.ritNumber)}
              </span>
              <span className="font-medium text-red-800">{t('pileHaulage.skipped')}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
