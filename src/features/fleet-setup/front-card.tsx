import { useTranslation } from 'react-i18next'
import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'

interface FrontCardProps {
  entry: FleetSetupDraftEntry
  sectorCode: string
  effectiveTruckIds: readonly string[]
  previewErrorKey?: string
  referenceFrontId?: string
  onEdit: () => void
  onRemove: () => void
}

export function FrontCard({
  entry,
  sectorCode,
  effectiveTruckIds,
  previewErrorKey,
  referenceFrontId,
  onEdit,
  onRemove,
}: FrontCardProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-all">{entry.frontId}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('fleetSetup.sector')}</dt>
          <dd className="break-all text-right font-medium">{sectorCode}</dd>
          <dt className="text-muted-foreground">{t('fleetSetup.hauler')}</dt>
          <dd className="break-all text-right font-medium">{entry.haulerCode}</dd>
          <dt className="text-muted-foreground">{t('fleetSetup.fleetType')}</dt>
          <dd className="text-right font-medium">
            {t(entry.kind === 'BASE' ? 'fleetSetup.directFleet' : 'fleetSetup.referencedFleet')}
          </dd>
          {entry.kind === 'DERIVED' ? (
            <>
              <dt className="text-muted-foreground">{t('fleetSetup.referenceFleet')}</dt>
              <dd className="break-all text-right font-medium">
                {t('fleetSetup.frontReference', {
                  frontId: referenceFrontId ?? entry.referenceFleetId,
                })}
              </dd>
            </>
          ) : null}
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
            aria-label={t('fleetSetup.removeFrontNamed', { frontId: entry.frontId })}
          >
            {t('fleetSetup.removeFront')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
