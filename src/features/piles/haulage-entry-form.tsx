import { useId, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isFrontTruckSelectionCurrent,
  type OperationalFleetOption,
} from '@/application/haulage-operation/operational-fleet-options'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface HaulageEntryFormProps {
  frontOptions: readonly OperationalFleetOption[]
  selectedFleetId: string
  selectedTruckId: string
  onFrontChange: (fleetId: string) => void
  onTruckChange: (truckId: string) => void
  onSubmit: () => void
  saving: boolean
  isSample: boolean
}

/**
 * Normal haulage entry: select Front (labeled by FrontId, keyed by
 * FleetId), select Truck (filtered to that Fleet's effective members
 * only — docs/ROADMAP.md Phase 10 §16/§17), then Record. No free-text
 * Truck entry and no unknown Truck is ever offered.
 */
export function HaulageEntryForm({
  frontOptions,
  selectedFleetId,
  selectedTruckId,
  onFrontChange,
  onTruckChange,
  onSubmit,
  saving,
  isSample,
}: HaulageEntryFormProps) {
  const { t } = useTranslation()
  const frontSelectId = useId()
  const truckSelectId = useId()

  const selectedOption = frontOptions.find((option) => option.fleetId === selectedFleetId)
  const truckOptions = selectedOption?.effectiveTruckIds ?? []
  const canSubmit = isFrontTruckSelectionCurrent(frontOptions, selectedFleetId, selectedTruckId) && !saving

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit()
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={frontSelectId} className="text-sm font-medium">
              {t('pileHaulage.front')}
            </label>
            <select
              id={frontSelectId}
              value={selectedFleetId}
              onChange={(event) => onFrontChange(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('pileHaulage.selectFront')}</option>
              {frontOptions.map((option) => (
                <option key={option.fleetId} value={option.fleetId}>
                  {option.frontId}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={truckSelectId} className="text-sm font-medium">
              {t('pileHaulage.truck')}
            </label>
            <select
              id={truckSelectId}
              value={selectedTruckId}
              onChange={(event) => onTruckChange(event.target.value)}
              disabled={!selectedFleetId}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('pileHaulage.selectTruck')}</option>
              {truckOptions.map((truckId) => (
                <option key={truckId} value={truckId}>
                  {truckId}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" size="lg" className="h-14 w-full" disabled={!canSubmit}>
            {saving
              ? t('pileHaulage.recording')
              : isSample
                ? t('pileHaulage.recordSampleHaulage')
                : t('pileHaulage.recordHaulage')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
