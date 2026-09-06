import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface FreshPileStartPositionFormProps {
  /** Prefilled Batch/Rit — the confirmed default (1/1) or the previously confirmed value being changed. */
  initialBatchNumber: number
  initialRitNumber: number
  onConfirm: (batchNumber: number, ritNumber: number) => void
  /** Present only when there is an already-confirmed value to revert to (post-inspection correction §6 — "still editable before first haulage"). */
  onCancel?: () => void
  saving?: boolean
  errorKey?: string
}

/**
 * "INITIAL POSITION" / Batch Awal / Rit Awal form for a truly fresh Pile
 * (post-inspection correction §6). Both fields are prefilled (Batch 001 /
 * Rit 001 by default) and freely editable — no confirmed business rule
 * forces the default, only offers it. Values are plain numeric inputs;
 * all range/positivity validation is delegated to the caller
 * (`confirmFreshPileStartPosition`), never duplicated here.
 */
export function FreshPileStartPositionForm({
  initialBatchNumber,
  initialRitNumber,
  onConfirm,
  onCancel,
  saving = false,
  errorKey,
}: FreshPileStartPositionFormProps) {
  const { t } = useTranslation()
  const [batchNumber, setBatchNumber] = useState(String(initialBatchNumber).padStart(3, '0'))
  const [ritNumber, setRitNumber] = useState(String(initialRitNumber).padStart(3, '0'))
  const batchInputId = useId()
  const ritInputId = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    onConfirm(Number(batchNumber), Number(ritNumber))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pileHaulage.initialPosition.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={batchInputId} className="text-sm font-medium">
              {t('pileHaulage.initialPosition.batchAwal')}
            </label>
            <input
              id={batchInputId}
              inputMode="numeric"
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ritInputId} className="text-sm font-medium">
              {t('pileHaulage.initialPosition.ritAwal')}
            </label>
            <input
              id={ritInputId}
              inputMode="numeric"
              value={ritNumber}
              onChange={(event) => setRitNumber(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            />
          </div>

          {errorKey ? (
            <p role="alert" className="text-sm text-red-600">
              {t(errorKey)}
            </p>
          ) : null}

          <div className={onCancel ? 'grid grid-cols-2 gap-2' : undefined}>
            {onCancel ? (
              <Button type="button" variant="secondary" onClick={onCancel}>
                {t('pileHaulage.initialPosition.cancel')}
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? t('pileHaulage.initialPosition.confirming') : t('pileHaulage.initialPosition.confirm')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
