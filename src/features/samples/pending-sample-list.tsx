import { useTranslation } from 'react-i18next'
import type { PendingSamplePile } from '@/application/sample-handling/derive-pending-samples'
import type { BatchNumber } from '@/domain/batch/batch-number'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Pile } from '@/domain/pile/pile'

interface PendingSampleListProps {
  pendingSamplePiles: readonly PendingSamplePile[]
  onHandleSample: (pile: Pile, batchNumber: BatchNumber) => void
}

/**
 * Flat list of pending Pile+Batch sample cards (docs/ROADMAP.md Phase 11
 * §28/§43): one card per Pile/Batch combination with its pending sampled
 * Rit numbers and a Handle Sample action that pre-fills the editor
 * below. Never a spreadsheet-style table (UI_UX_SPEC.md §97).
 */
export function PendingSampleList({ pendingSamplePiles, onHandleSample }: PendingSampleListProps) {
  const { t } = useTranslation()

  if (pendingSamplePiles.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('sampleHandling.noPendingSamples')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingSamplePiles.flatMap((pendingPile) =>
        pendingPile.batches.map((batch) => (
          <Card key={`${pendingPile.pile.id}-${Number(batch.batchNumber)}`}>
            <CardContent className="flex flex-col gap-2">
              <p className="break-words text-base font-semibold">{pendingPile.pile.id}</p>
              <p className="text-sm text-muted-foreground">{pendingPile.pile.oreCode}</p>
              <p className="text-sm">
                {t('sampleHandling.batch')} {Number(batch.batchNumber)}
              </p>
              <div>
                <p className="text-xs text-muted-foreground">{t('sampleHandling.pendingSamples')}</p>
                <p className="text-sm font-medium">{batch.pendingRitNumbers.map((rit) => Number(rit)).join(', ')}</p>
              </div>
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => onHandleSample(pendingPile.pile, batch.batchNumber)}
              >
                {t('sampleHandling.handleSample')}
              </Button>
            </CardContent>
          </Card>
        )),
      )}
    </div>
  )
}
