import { useTranslation } from 'react-i18next'
import { formatFrontId, type FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import type { EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import type { SectorCode } from '@/domain/common/codes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface FleetSetupSummaryProps {
  sectorCode: SectorCode
  entries: readonly FleetSetupDraftEntry[]
  effectiveFleets: readonly EffectiveFleet[]
  onEdit: () => void
  onContinue: () => void
}

/** Never shows "Tipe Fleet"/BASE/DERIVED terminology (Phase 18 §5) — only the resolved Front No/Fleet Reference/Destination, mirroring `FrontCard`. */
export function FleetSetupSummary({
  sectorCode,
  entries,
  effectiveFleets,
  onEdit,
  onContinue,
}: FleetSetupSummaryProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('fleetSetup.readyTitle')}</CardTitle>
        <CardDescription>{t('fleetSetup.readyDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const effective = effectiveFleets.find((fleet) => fleet.fleetId === entry.fleetId)
            const reference = entries.find(
              (candidate) => candidate.fleetId === entry.referenceFleetId,
            )
            return (
              <li key={entry.fleetId} className="rounded-lg border border-border p-3">
                <p className="break-all font-semibold">{formatFrontId(sectorCode, entry.frontNumber)}</p>
                <p className="break-all text-sm text-muted-foreground">{entry.haulerCode}</p>
                {entry.destinationPileId ? (
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {t('fleetSetup.destinationPile')}: {entry.destinationPileId}
                  </p>
                ) : null}
                <p className="mt-1 text-sm">
                  {entry.kind === 'DERIVED'
                    ? t('fleetSetup.frontReference', {
                        frontId: reference ? formatFrontId(sectorCode, reference.frontNumber) : entry.referenceFleetId,
                      })
                    : t('fleetSetup.noReference')}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {t('fleetSetup.truckCount')}: {effective?.truckIds.length ?? 0}
                </p>
              </li>
            )
          })}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onEdit}>
            {t('fleetSetup.edit')}
          </Button>
          <Button type="button" onClick={onContinue}>
            {t('fleetSetup.continue')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
