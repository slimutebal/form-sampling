import { useId, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PendingSampleBatch } from '@/application/sample-handling/derive-pending-samples'
import type { DeliveryDestinationOption } from '@/application/sample-handling/delivery-destination'
import type { SampleRangePreview } from '@/application/sample-handling/sample-range-preview'
import type { RitNumber } from '@/domain/batch/rit-number'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { EmployeeReference } from '@/domain/master/references'
import type { Pile } from '@/domain/pile/pile'
import { saveErrorTranslationKey } from '@/features/samples/error-messages'

export type DeliveryStatusDraft = 'NOT_PICKED_UP' | 'DELIVERED'

interface SampleHandlingFormProps {
  pileOptions: readonly Pile[]
  selectedPile: Pile | undefined
  selectedPileId: string
  onPileChange: (pileId: string) => void

  batchOptions: readonly PendingSampleBatch[]
  selectedBatchNumber: string
  onBatchChange: (batchNumber: string) => void

  ritOptions: readonly RitNumber[]
  ritFrom: string
  ritTo: string
  onRitFromChange: (value: string) => void
  onRitToChange: (value: string) => void

  rangePreview: SampleRangePreview | undefined
  rangeErrorCode: string | undefined

  deliveryStatus: DeliveryStatusDraft
  onDeliveryStatusChange: (status: DeliveryStatusDraft) => void

  deliveryDestinations: readonly DeliveryDestinationOption[]
  destinationCode: string
  onDestinationChange: (code: string) => void

  employees: readonly EmployeeReference[]
  dispatcherEmployeeId: string
  onDispatcherChange: (id: string) => void

  overlapErrorCode: string | undefined

  onSubmit: () => void
  saving: boolean
  canSubmit: boolean
}

/**
 * The Handle Sample editor (docs/ROADMAP.md Phase 11 §28-§36). Pile,
 * Batch, Rit From/To are selectors sourced from pending sample data —
 * never free text. Ore is read-only, derived from the selected Pile.
 * Sample Range / Total Bag are a live preview computed by
 * `previewSampleRange` (application layer) — never recalculated here.
 * Delivery fields only appear when DELIVERED is selected.
 */
export function SampleHandlingForm({
  pileOptions,
  selectedPile,
  selectedPileId,
  onPileChange,
  batchOptions,
  selectedBatchNumber,
  onBatchChange,
  ritOptions,
  ritFrom,
  ritTo,
  onRitFromChange,
  onRitToChange,
  rangePreview,
  rangeErrorCode,
  deliveryStatus,
  onDeliveryStatusChange,
  deliveryDestinations,
  destinationCode,
  onDestinationChange,
  employees,
  dispatcherEmployeeId,
  onDispatcherChange,
  overlapErrorCode,
  onSubmit,
  saving,
  canSubmit,
}: SampleHandlingFormProps) {
  const { t } = useTranslation()
  const pileSelectId = useId()
  const batchSelectId = useId()
  const ritFromSelectId = useId()
  const ritToSelectId = useId()
  const deliveryStatusSelectId = useId()
  const destinationSelectId = useId()
  const dispatcherSelectId = useId()

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
            <label htmlFor={pileSelectId} className="text-sm font-medium">
              {t('sampleHandling.pile')}
            </label>
            <select
              id={pileSelectId}
              value={selectedPileId}
              onChange={(event) => onPileChange(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('sampleHandling.selectPile')}</option>
              {pileOptions.map((pile) => (
                <option key={pile.id} value={pile.id}>
                  {pile.id}
                </option>
              ))}
            </select>
          </div>

          {selectedPile ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('sampleHandling.ore')}</span>
              <p className="text-base" data-testid="selected-ore">
                {selectedPile.oreCode}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={batchSelectId} className="text-sm font-medium">
              {t('sampleHandling.batch')}
            </label>
            <select
              id={batchSelectId}
              value={selectedBatchNumber}
              onChange={(event) => onBatchChange(event.target.value)}
              disabled={!selectedPile}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('sampleHandling.selectBatch')}</option>
              {batchOptions.map((batch) => (
                <option key={Number(batch.batchNumber)} value={String(batch.batchNumber)}>
                  {Number(batch.batchNumber)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ritFromSelectId} className="text-sm font-medium">
              {t('sampleHandling.ritFrom')}
            </label>
            <select
              id={ritFromSelectId}
              value={ritFrom}
              onChange={(event) => onRitFromChange(event.target.value)}
              disabled={ritOptions.length === 0}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('sampleHandling.selectRitFrom')}</option>
              {ritOptions.map((rit) => (
                <option key={Number(rit)} value={String(Number(rit))}>
                  {Number(rit)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ritToSelectId} className="text-sm font-medium">
              {t('sampleHandling.ritTo')}
            </label>
            <select
              id={ritToSelectId}
              value={ritTo}
              onChange={(event) => onRitToChange(event.target.value)}
              disabled={ritOptions.length === 0}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('sampleHandling.selectRitTo')}</option>
              {ritOptions.map((rit) => (
                <option key={Number(rit)} value={String(Number(rit))}>
                  {Number(rit)}
                </option>
              ))}
            </select>
          </div>

          {rangePreview ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('sampleHandling.sampleRange')}</span>
              <p className="text-base" data-testid="sample-range-value">
                {rangePreview.range.sampledRitNumbers.map((rit) => Number(rit)).join(', ')}
              </p>
              <span className="text-sm font-medium">{t('sampleHandling.totalBag')}</span>
              <p className="text-base" data-testid="total-bag-value">
                {Number(rangePreview.totalBag)}
              </p>
            </div>
          ) : null}

          {rangeErrorCode ? (
            <p role="alert" className="text-sm text-red-600">
              {t(saveErrorTranslationKey(rangeErrorCode))}
            </p>
          ) : null}

          {overlapErrorCode ? (
            <p role="alert" className="text-sm text-red-600">
              {t(saveErrorTranslationKey(overlapErrorCode))}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={deliveryStatusSelectId} className="text-sm font-medium">
              {t('sampleHandling.deliveryStatus')}
            </label>
            <select
              id={deliveryStatusSelectId}
              value={deliveryStatus}
              onChange={(event) => onDeliveryStatusChange(event.target.value as DeliveryStatusDraft)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="NOT_PICKED_UP">{t('sampleHandling.notPickedUp')}</option>
              <option value="DELIVERED">{t('sampleHandling.delivered')}</option>
            </select>
          </div>

          {deliveryStatus === 'DELIVERED' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={destinationSelectId} className="text-sm font-medium">
                  {t('sampleHandling.deliverTo')}
                </label>
                <select
                  id={destinationSelectId}
                  value={destinationCode}
                  onChange={(event) => onDestinationChange(event.target.value)}
                  className="h-11 rounded-md border border-border bg-background px-3 text-base"
                >
                  <option value="">{t('sampleHandling.selectDestination')}</option>
                  {deliveryDestinations.map((destination) => (
                    <option key={destination.code} value={destination.code}>
                      {destination.label ?? destination.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={dispatcherSelectId} className="text-sm font-medium">
                  {t('sampleHandling.dispatcher')}
                </label>
                <select
                  id={dispatcherSelectId}
                  value={dispatcherEmployeeId}
                  onChange={(event) => onDispatcherChange(event.target.value)}
                  className="h-11 rounded-md border border-border bg-background px-3 text-base"
                >
                  <option value="">{t('sampleHandling.noDispatcher')}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.id} — {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <Button type="submit" size="lg" className="h-14 w-full" disabled={!canSubmit}>
            {saving ? t('sampleHandling.saving') : t('sampleHandling.saveSamplePosition')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
