import { useTranslation } from 'react-i18next'
import { formatFrontId, type FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'

interface FrontCardProps {
  entry: FleetSetupDraftEntry
  sectorCode: string
  effectiveTruckIds: readonly string[]
  previewErrorKey?: string
  referenceFrontNumber?: string
  destinationOreCode?: string
  destinationStockpileCode?: string
  onEdit: () => void
  onRemove: () => void
}

/**
 * Displays one configured Front (Phase 18 §5). Never shows "Tipe
 * Fleet"/BASE/DERIVED terminology — whether this Front has a Fleet
 * Reference is implied entirely by whether the Reference row below is
 * present, mirroring how `FrontEditor` derives `kind` from that same
 * field rather than a separate selector.
 */
export function FrontCard({
  entry,
  sectorCode,
  effectiveTruckIds,
  previewErrorKey,
  referenceFrontNumber,
  destinationOreCode,
  destinationStockpileCode,
  onEdit,
  onRemove,
}: FrontCardProps) {
  const { t } = useTranslation()
  const frontId = formatFrontId(sectorCode, entry.frontNumber)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-all">{frontId}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('fleetSetup.sector')}</dt>
          <dd className="break-all text-right font-medium">{sectorCode}</dd>
          <dt className="text-muted-foreground">{t('fleetSetup.hauler')}</dt>
          <dd className="break-all text-right font-medium">{entry.haulerCode}</dd>
          {entry.destinationPileId ? (
            <>
              <dt className="text-muted-foreground">{t('fleetSetup.destinationPile')}</dt>
              <dd className="break-all text-right font-medium">
                {entry.destinationPileId}
                {destinationOreCode ? ` · ${destinationOreCode}` : ''}
                {destinationStockpileCode ? ` · ${destinationStockpileCode}` : ''}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t('fleetSetup.referenceFleet')}</dt>
          <dd className="break-all text-right font-medium">
            {entry.kind === 'DERIVED'
              ? t('fleetSetup.frontReference', {
                  frontId: referenceFrontNumber
                    ? formatFrontId(sectorCode, referenceFrontNumber)
                    : entry.referenceFleetId,
                })
              : t('fleetSetup.noReference')}
          </dd>
        </dl>
        <EffectiveFleetPreview truckIds={effectiveTruckIds} errorKey={previewErrorKey} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onEdit}>
            {t('fleetSetup.editFront')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={t('fleetSetup.removeFrontNamed', { frontId })}
          >
            {t('fleetSetup.removeFront')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
