import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adjustFrontFleet, type AdjustFrontFleetResult } from '@/application/fleet-setup/adjust-front-fleet'
import { truckOptionsForHauler } from '@/application/fleet-setup/effective-fleet-preview'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { FrontDefinition } from '@/domain/fleet/front'
import type { MasterData } from '@/domain/master/master-data'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'
import { SelectedTrucks, TruckAction } from '@/features/fleet-setup/truck-action-controls'
import { fleetActiveErrorTranslationKey } from '@/features/fleet/error-messages'

export interface FrontFleetAdjustmentEditorProps {
  readonly front: FrontDefinition
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  readonly onSave: (result: AdjustFrontFleetResult) => void
  readonly onCancel: () => void
}

/**
 * "Atur Unit" / "Edit Unit" editor for an ACTIVE Front (Field Finding 2):
 * a persistent effective-fleet adjustment, distinct from Pile's ad-hoc
 * "wrong truck" recording — a truck added here becomes VALID for every
 * following Rit on this Front, a truck removed here becomes TRUCK SALAH
 * if it arrives again, and this never creates a successor Front (BR1/04
 * stays BR1/04; see `adjustFrontFleet`). Only Front No/Hauler/Destination
 * are shown read-only here — editing those belongs to the separate
 * continuation/new-BASE-Front workflow (`FrontContinuationEditor`), never
 * this one.
 */
export function FrontFleetAdjustmentEditor({
  front,
  masterData,
  fleetSetup,
  onSave,
  onCancel,
}: FrontFleetAdjustmentEditorProps) {
  const { t } = useTranslation()
  const addTruckSelectId = useId()

  const currentFleet = fleetSetup.fleets.find((fleet) => fleet.frontId === front.frontId)
  const initialTruckIds = useMemo(() => {
    if (!currentFleet) return []
    const resolved = resolveEffectiveFleetAgainstMaster(masterData, fleetSetup, currentFleet.fleetId)
    return resolved.ok ? [...resolved.value.truckIds] : []
  }, [currentFleet, masterData, fleetSetup])

  const [truckIds, setTruckIds] = useState<readonly string[]>(initialTruckIds)
  const [selectedAddTruck, setSelectedAddTruck] = useState('')
  const [submitErrorCode, setSubmitErrorCode] = useState<string>()

  const addOptions = truckOptionsForHauler(masterData, front.haulerCode).filter((id) => !truckIds.includes(id))

  const candidate = useMemo(
    () => adjustFrontFleet({ fleetSetup, masterData, frontId: front.frontId, truckIds }),
    [fleetSetup, masterData, front.frontId, truckIds],
  )

  function handleSubmit() {
    if (!candidate.ok) {
      setSubmitErrorCode(candidate.error.code)
      return
    }
    onSave(candidate.value)
  }

  const displayErrorCode = submitErrorCode ?? (!candidate.ok ? candidate.error.code : undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-all">{t('fleetActive.adjustUnitTitle', { frontId: front.frontId })}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('fleetSetup.hauler')}</dt>
          <dd className="break-all text-right font-medium">{front.haulerCode}</dd>
          <dt className="text-muted-foreground">{t('fleetSetup.destinationPile')}</dt>
          <dd className="break-all text-right font-medium">{front.destinationPileId ?? t('fleetSetup.noReference')}</dd>
        </dl>

        <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <h4 className="font-semibold">{t('fleetActive.currentTrucks')}</h4>
          <SelectedTrucks
            truckIds={truckIds}
            actionLabel={(id) => t('fleetSetup.removeTruckNamed', { truckId: id })}
            onRemove={(id) => setTruckIds((current) => current.filter((truckId) => truckId !== id))}
          />
          <TruckAction
            id={addTruckSelectId}
            label={t('fleetSetup.addTruck')}
            actionLabel={t('fleetSetup.addTruck')}
            options={addOptions}
            value={selectedAddTruck}
            onValueChange={setSelectedAddTruck}
            onAction={(truckId) => {
              if (!addOptions.includes(truckId)) return
              setTruckIds((current) => [...current, truckId])
              setSelectedAddTruck('')
            }}
          />
        </section>

        <EffectiveFleetPreview
          truckIds={candidate.ok ? candidate.value.effectiveFleet.truckIds : []}
          errorKey={displayErrorCode ? fleetActiveErrorTranslationKey(displayErrorCode) : undefined}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('fleetSetup.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {t('fleetActive.saveUnits')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
