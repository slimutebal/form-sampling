import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import type { PendingBatchGroup } from '@/features/handover/group-pending-batches-by-pile'

interface HandoverPilePreviewCardProps {
  group: PendingBatchGroup
}

/**
 * One Pile's active (CONTINUE) carry-over batches (UI_UX_SPEC.md §21):
 *
 * PILE-1
 * SAP
 * Batch 24 → last Rit 10
 * Batch 25 → last Rit 03
 * CONTINUE
 */
export function HandoverPilePreviewCard({ group }: HandoverPilePreviewCardProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="break-words text-base font-semibold">{group.pile.id}</p>
        <p className="text-sm text-muted-foreground">{group.pile.oreCode}</p>
        <div className="flex flex-col gap-1">
          {group.batches.map((batch) => (
            <p key={Number(batch.batchNumber)} className="text-sm">
              {t('handover.batchLastRit', { batch: Number(batch.batchNumber), rit: Number(batch.lastRit) })}
            </p>
          ))}
        </div>
        <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          {t('handover.continueStatus')}
        </span>
      </CardContent>
    </Card>
  )
}
