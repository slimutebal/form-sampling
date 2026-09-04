import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeliveryDestinationOption } from '@/application/sample-handling/delivery-destination'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import { previewSampleRange } from '@/application/sample-handling/sample-range-preview'
import {
  generateSamplePositionId as defaultGenerateSamplePositionId,
  type SamplePositionIdGenerator,
} from '@/application/sample-handling/sample-position-id-generator'
import { recordSamplePosition, type SamplePositionDeliveryDraft } from '@/application/sample-handling/create-sample-position'
import type { SampleHandlingStore } from '@/application/sample-handling/sample-handling-store'
import { parseRitNumber } from '@/domain/batch/rit-number'
import type { BatchNumber } from '@/domain/batch/batch-number'
import { validateNoSampleOverlap } from '@/domain/sample-handling/sample-overlap'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'
import { loadErrorTranslationKey, saveErrorTranslationKey } from '@/features/samples/error-messages'
import { HandledSampleList } from '@/features/samples/handled-sample-list'
import { PendingSampleList } from '@/features/samples/pending-sample-list'
import { SampleHandlingForm, type DeliveryStatusDraft } from '@/features/samples/sample-handling-form'

export interface SampleHandlingPageProps {
  /** Already-validated Shift context; Phase 11 consumes it, it does not create/transition it. */
  shift: Shift
  /** Already-validated Piles for this shift workspace. */
  piles: readonly Pile[]
  masterData: MasterData
  /**
   * Caller-supplied delivery destination catalog (docs/ROADMAP.md Phase
   * 11 §9) — no confirmed MasterData collection is authoritative for
   * this yet.
   */
  deliveryDestinations: readonly DeliveryDestinationOption[]
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: SampleHandlingStore
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  generateSamplePositionId?: SamplePositionIdGenerator
}

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | {
      readonly kind: 'loaded'
      readonly haulageTransactions: readonly HaulageTransaction[]
      readonly samplePositions: readonly SamplePosition[]
    }

/**
 * The primary Sample Handling workflow (docs/ROADMAP.md Phase 11):
 * loads haulage transactions and Sample Positions for this Shift,
 * derives pending sample requirements, lets the operator handle one
 * (Pile/Batch/Rit From/Rit To selected from pending data, delivery
 * status, destination, dispatcher), and saves it. All business
 * calculation is delegated to `src/application/sample-handling/**` and
 * `src/domain/sample-handling/**` — this component only orchestrates
 * and renders.
 */
export function SampleHandlingPage({
  shift,
  piles,
  masterData,
  deliveryDestinations,
  store,
  generateSamplePositionId = defaultGenerateSamplePositionId,
}: SampleHandlingPageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  const [selectedPileId, setSelectedPileId] = useState('')
  const [selectedBatchNumber, setSelectedBatchNumber] = useState('')
  const [ritFrom, setRitFrom] = useState('')
  const [ritTo, setRitTo] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusDraft>('NOT_PICKED_UP')
  const [destinationCode, setDestinationCode] = useState('')
  const [dispatcherEmployeeId, setDispatcherEmployeeId] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveErrorCode, setSaveErrorCode] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })

    void Promise.all([store.listHaulageTransactionsForShift(shift.id), store.listSamplePositionsForShift(shift.id)]).then(
      ([haulageResult, samplePositionResult]) => {
        if (cancelled) {
          return
        }
        if (!haulageResult.ok) {
          setPhase({ kind: 'error', code: haulageResult.error.code })
          return
        }
        if (!samplePositionResult.ok) {
          setPhase({ kind: 'error', code: samplePositionResult.error.code })
          return
        }
        setPhase({
          kind: 'loaded',
          haulageTransactions: haulageResult.value,
          samplePositions: samplePositionResult.value,
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [store, shift.id, reloadToken])

  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const pendingSamplePiles = useMemo(() => {
    if (phase.kind !== 'loaded') {
      return []
    }
    return derivePendingSamples({
      shiftId: shift.id,
      piles,
      haulageTransactions: phase.haulageTransactions,
      samplePositions: phase.samplePositions,
    })
  }, [phase, shift.id, piles])

  const pileOptions = pendingSamplePiles.map((pendingPile) => pendingPile.pile)
  const selectedPile = pileOptions.find((pile) => pile.id === selectedPileId)
  const selectedPendingPile = pendingSamplePiles.find((pendingPile) => pendingPile.pile.id === selectedPileId)
  const batchOptions = selectedPendingPile?.batches ?? []
  const selectedBatch = batchOptions.find((batch) => String(Number(batch.batchNumber)) === selectedBatchNumber)
  const ritOptions = selectedBatch?.pendingRitNumbers ?? []

  const rangePreviewResult = useMemo(() => {
    if (!selectedPile || !ritFrom || !ritTo) {
      return undefined
    }
    const from = parseRitNumber(Number(ritFrom))
    const to = parseRitNumber(Number(ritTo))
    if (!from.ok || !to.ok) {
      return undefined
    }
    return previewSampleRange(selectedPile, masterData, from.value, to.value)
  }, [selectedPile, masterData, ritFrom, ritTo])

  const existingPositions = useMemo(
    () => (phase.kind === 'loaded' ? phase.samplePositions : []),
    [phase],
  )

  const overlapResult = useMemo(() => {
    if (!selectedPile || !selectedBatch || !rangePreviewResult?.ok) {
      return undefined
    }
    return validateNoSampleOverlap(
      {
        shiftId: shift.id,
        pileId: selectedPile.id,
        batchNumber: selectedBatch.batchNumber,
        sampledRitNumbers: rangePreviewResult.value.range.sampledRitNumbers,
      },
      existingPositions,
    )
  }, [selectedPile, selectedBatch, rangePreviewResult, existingPositions, shift.id])

  function handlePileChange(pileId: string) {
    setSelectedPileId(pileId)
    setSelectedBatchNumber('')
    setRitFrom('')
    setRitTo('')
    setSaveErrorCode(undefined)
  }

  function handleBatchChange(batchNumber: string) {
    setSelectedBatchNumber(batchNumber)
    setRitFrom('')
    setRitTo('')
    setSaveErrorCode(undefined)
  }

  function handleRitFromChange(value: string) {
    setRitFrom(value)
    setSaveErrorCode(undefined)
  }

  function handleRitToChange(value: string) {
    setRitTo(value)
    setSaveErrorCode(undefined)
  }

  function handleDeliveryStatusChange(status: DeliveryStatusDraft) {
    setDeliveryStatus(status)
    if (status === 'NOT_PICKED_UP') {
      // BR-DELIVERY: NOT_PICKED_UP must not silently retain stale
      // delivery metadata from a prior DELIVERED selection.
      setDestinationCode('')
      setDispatcherEmployeeId('')
    }
    setSaveErrorCode(undefined)
  }

  // Whether a raw UI-selected destination code is still present in the
  // caller-supplied catalog. A blank dispatcherEmployeeId is always
  // considered current (dispatcher is optional). Shared by `canSubmit`
  // (gates the Save button) and `handleSave`'s defensive re-check —
  // both call sites must agree, so the check lives here once.
  function isDestinationCurrent(code: string): boolean {
    return deliveryDestinations.some((destination) => destination.code === code)
  }

  function isDispatcherCurrent(employeeId: string): boolean {
    return employeeId.length === 0 || masterData.employees.some((employee) => employee.id === employeeId)
  }

  function handleHandleSample(pile: Pile, batchNumber: BatchNumber) {
    setSelectedPileId(pile.id)
    setSelectedBatchNumber(String(Number(batchNumber)))
    setRitFrom('')
    setRitTo('')
    setDeliveryStatus('NOT_PICKED_UP')
    setDestinationCode('')
    setDispatcherEmployeeId('')
    setSaveErrorCode(undefined)
    setSuccessMessage(undefined)
  }

  // DELIVERED must have a destination that still exists in the current
  // destination catalog, and — if a dispatcher is selected — a
  // dispatcher that still exists in the current employee master. Either
  // catalog can change out from under a stale in-progress selection
  // (e.g. the caller re-supplies a new `deliveryDestinations`/
  // `masterData` prop), so this is re-validated against the latest
  // props on every render rather than only checked once at selection
  // time.
  const deliveryContextValid =
    deliveryStatus === 'NOT_PICKED_UP' ||
    (destinationCode.trim().length > 0 &&
      isDestinationCurrent(destinationCode) &&
      isDispatcherCurrent(dispatcherEmployeeId))

  const canSubmit =
    Boolean(selectedPile) &&
    Boolean(selectedBatch) &&
    rangePreviewResult?.ok === true &&
    overlapResult?.ok === true &&
    deliveryContextValid &&
    !saving

  async function handleSave() {
    if (isSubmittingRef.current) {
      return
    }
    if (!selectedPile || !selectedBatch || !rangePreviewResult?.ok) {
      return
    }

    // Defensive re-check, independent of SampleHandlingForm's own
    // `disabled` state (Phase 10 pattern): the overlap check must still
    // hold against the latest loaded SamplePositions immediately before
    // an id is generated. Nothing is generated and nothing is written
    // when this fails.
    const finalOverlapCheck = validateNoSampleOverlap(
      {
        shiftId: shift.id,
        pileId: selectedPile.id,
        batchNumber: selectedBatch.batchNumber,
        sampledRitNumbers: rangePreviewResult.value.range.sampledRitNumbers,
      },
      existingPositions,
    )
    if (!finalOverlapCheck.ok) {
      setSaveErrorCode(finalOverlapCheck.error.code)
      return
    }

    // Defensive re-check of the delivery context, independent of the
    // form's own `disabled` state and run before any id is generated:
    // the selected destination/dispatcher must still exist in the
    // latest deliveryDestinations/masterData.employees. A caller-driven
    // prop change (e.g. a destination removed from the catalog, or an
    // employee removed from the master) can leave a stale selection in
    // local state without the operator having touched the selects
    // again.
    if (deliveryStatus === 'DELIVERED') {
      if (destinationCode.trim().length === 0) {
        setSaveErrorCode('BLANK_DELIVERY_DESTINATION_CODE')
        return
      }
      if (!isDestinationCurrent(destinationCode)) {
        setSaveErrorCode('DELIVERY_DESTINATION_NOT_FOUND')
        return
      }
      if (!isDispatcherCurrent(dispatcherEmployeeId)) {
        setSaveErrorCode('DISPATCHER_NOT_FOUND')
        return
      }
    }

    isSubmittingRef.current = true
    setSaving(true)
    setSaveErrorCode(undefined)
    setSuccessMessage(undefined)

    try {
      const delivery: SamplePositionDeliveryDraft =
        deliveryStatus === 'NOT_PICKED_UP'
          ? { status: 'NOT_PICKED_UP' }
          : {
              status: 'DELIVERED',
              destination: destinationCode,
              dispatcherEmployeeId: dispatcherEmployeeId.length > 0 ? dispatcherEmployeeId : undefined,
            }

      const created = recordSamplePosition({
        generatedSamplePositionId: generateSamplePositionId(),
        shift,
        pile: selectedPile,
        batchNumber: Number(selectedBatch.batchNumber),
        ritFrom: Number(rangePreviewResult.value.range.ritFrom),
        ritTo: Number(rangePreviewResult.value.range.ritTo),
        masterData,
        delivery,
      })
      if (!created.ok) {
        setSaveErrorCode(created.error.code)
        return
      }

      const saved = await store.addSamplePosition(created.value)
      if (!saved.ok) {
        setSaveErrorCode(saved.error.code)
        return
      }

      const savedPosition = created.value
      setPhase((current) =>
        current.kind === 'loaded'
          ? {
              kind: 'loaded',
              haulageTransactions: current.haulageTransactions,
              samplePositions: [...current.samplePositions, savedPosition],
            }
          : current,
      )
      setSelectedBatchNumber('')
      setRitFrom('')
      setRitTo('')
      setDeliveryStatus('NOT_PICKED_UP')
      setDestinationCode('')
      setDispatcherEmployeeId('')
      setSuccessMessage(t('sampleHandling.saved'))
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={t('sampleHandling.title')} />
        <div className="px-4 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('sampleHandling.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('sampleHandling.title')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t(loadErrorTranslationKey(phase.code))}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="h-11 rounded-md border border-border px-4 text-base font-medium"
              >
                {t('sampleHandling.retry')}
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Count individual pending sampled Rit numbers, not batch groups — a
  // Pile/Batch group with 5 pending Rits must contribute 5, not 1.
  const pendingCount = pendingSamplePiles.reduce(
    (total, pendingPile) =>
      total + pendingPile.batches.reduce((batchTotal, batch) => batchTotal + batch.pendingRitNumbers.length, 0),
    0,
  )
  const rangeErrorCode = rangePreviewResult && !rangePreviewResult.ok ? rangePreviewResult.error.code : undefined
  const overlapErrorCode = overlapResult && !overlapResult.ok ? overlapResult.error.code : undefined

  return (
    <div>
      <PageHeader title={t('sampleHandling.title')} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Card>
          <CardContent className="flex flex-row justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('sampleHandling.pending')}</p>
              <p className="text-xl font-semibold" data-testid="pending-count">
                {pendingCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('sampleHandling.handled')}</p>
              <p className="text-xl font-semibold" data-testid="handled-count">
                {phase.samplePositions.length}
              </p>
            </div>
          </CardContent>
        </Card>

        {successMessage ? (
          <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <div>
          <h2 className="mb-2 text-base font-semibold">{t('sampleHandling.pendingSamples')}</h2>
          <PendingSampleList pendingSamplePiles={pendingSamplePiles} onHandleSample={handleHandleSample} />
        </div>

        <SampleHandlingForm
          pileOptions={pileOptions}
          selectedPile={selectedPile}
          selectedPileId={selectedPileId}
          onPileChange={handlePileChange}
          batchOptions={batchOptions}
          selectedBatchNumber={selectedBatchNumber}
          onBatchChange={handleBatchChange}
          ritOptions={ritOptions}
          ritFrom={ritFrom}
          ritTo={ritTo}
          onRitFromChange={handleRitFromChange}
          onRitToChange={handleRitToChange}
          rangePreview={rangePreviewResult?.ok ? rangePreviewResult.value : undefined}
          rangeErrorCode={rangeErrorCode}
          deliveryStatus={deliveryStatus}
          onDeliveryStatusChange={handleDeliveryStatusChange}
          deliveryDestinations={deliveryDestinations}
          destinationCode={destinationCode}
          onDestinationChange={setDestinationCode}
          employees={masterData.employees}
          dispatcherEmployeeId={dispatcherEmployeeId}
          onDispatcherChange={setDispatcherEmployeeId}
          overlapErrorCode={overlapErrorCode}
          onSubmit={() => void handleSave()}
          saving={saving}
          canSubmit={canSubmit}
        />

        {saveErrorCode ? (
          <p role="alert" className="text-sm text-red-600">
            {t(saveErrorTranslationKey(saveErrorCode))}
          </p>
        ) : null}

        <div>
          <h2 className="mb-2 text-base font-semibold">{t('sampleHandling.handledSamples')}</h2>
          <HandledSampleList samplePositions={phase.samplePositions} employees={masterData.employees} />
        </div>
      </div>
    </div>
  )
}
