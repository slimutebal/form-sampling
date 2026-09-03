import { useTranslation } from 'react-i18next'
import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import type { EffectiveFleet } from '@/domain/fleet/fleet-resolution'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface FleetSetupSummaryProps {
  entries: readonly FleetSetupDraftEntry[]
  effectiveFleets: readonly EffectiveFleet[]
  onEdit: () => void
  onContinue: () => void
}

export function FleetSetupSummary({
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
                <p className="break-all font-semibold">{entry.frontId}</p>
                <p className="break-all text-sm text-muted-foreground">{entry.haulerCode}</p>
                <p className="mt-1 text-sm">
                  {t(
                    entry.kind === 'BASE' ? 'fleetSetup.directFleet' : 'fleetSetup.referencedFleet',
                  )}
                  {entry.kind === 'DERIVED'
                    ? ` · ${t('fleetSetup.frontReference', { frontId: reference?.frontId ?? entry.referenceFleetId })}`
                    : ''}
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
