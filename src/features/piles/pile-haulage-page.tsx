import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HaulageTransactionStore } from '@/application/haulage-operation/haulage-transaction-store'
import { deriveHaulageProgress } from '@/application/haulage-operation/derive-haulage-progress'
import { previewNextSampling } from '@/application/haulage-operation/next-sampling-preview'
import {
  isFrontTruckSelectionCurrent,
  operationalFleetOptions,
} from '@/application/haulage-operation/operational-fleet-options'
import { recordHaulage } from '@/application/haulage-operation/create-haulage-record'
import {
  generateHaulageTransactionId as defaultGenerateHaulageTransactionId,
  type HaulageTransactionIdGenerator,
} from '@/application/haulage-operation/haulage-id-generator'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { Shift } from '@/domain/shift/shift'
import { loadErrorTranslationKey, pileHaulageErrorTranslationKey } from '@/features/piles/error-messages'
import { HaulageEntryForm } from '@/features/piles/haulage-entry-form'
import { PileOperationalHeader } from '@/features/piles/pile-operational-header'
import { RecordedHaulageList } from '@/features/piles/recorded-haulage-list'
import { SkippedHaulageList } from '@/features/piles/skipped-haulage-list'

export interface PileHaulagePageProps {
  /** Already-validated Shift context; Phase 10 consumes it, it does not create/transition it. */
  shift: Shift
  /** Already-validated Pile; Phase 10 has no Add Pile flow (no confirmed PileId→Ore master source). */
  pile: Pile
  masterData: MasterData
  fleetSetup: FleetSetup
  /**
   * The authoritative, caller-supplied haulage plan for this Pile
   * (see `@/application/haulage-operation/haulage-plan`). Order is
   * ground truth — never derived from stored/loaded transaction order.
   */
  expectedPositions: readonly BatchPosition[]
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: HaulageTransactionStore
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  generateTransactionId?: HaulageTransactionIdGenerator
}

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'loaded'; readonly transactions: readonly HaulageTransaction[] }

/**
 * The primary normal operator haulage workflow (docs/ROADMAP.md Phase
 * 10): load persisted transactions for this Shift/Pile, derive
 * operational progress from the authoritative expected-position plan,
 * preview the next sampling point, let the operator select Front/Truck
 * from domain-resolved options, and record. All business calculation is
 * delegated to `src/application/haulage-operation/**` and Phase 2–6
 * domain functions — this component only orchestrates and renders.
 */
export function PileHaulagePage({
  shift,
  pile,
  masterData,
  fleetSetup,
  expectedPositions,
  store,
  generateTransactionId = defaultGenerateHaulageTransactionId,
}: PileHaulagePageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [saving, setSaving] = useState(false)
  const [recordErrorCode, setRecordErrorCode] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })

    void store.listHaulageTransactionsForShiftPile(shift.id, pile.id).then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setPhase({ kind: 'loaded', transactions: result.value })
      } else {
        setPhase({ kind: 'error', code: result.error.code })
      }
    })

    return () => {
      cancelled = true
    }
  }, [store, shift.id, pile.id, reloadToken])

  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const frontOptionsResult = useMemo(
    () => operationalFleetOptions(masterData, fleetSetup),
    [masterData, fleetSetup],
  )

  const progressResult = useMemo(() => {
    if (phase.kind !== 'loaded') {
      return undefined
    }
    return deriveHaulageProgress({
      shiftId: shift.id,
      pileId: pile.id,
      expectedPositions,
      transactions: phase.transactions,
    })
  }, [phase, shift.id, pile.id, expectedPositions])

  const nextPosition = progressResult && progressResult.ok ? progressResult.value.nextPosition : undefined

  const samplingPreviewResult = useMemo(() => {
    if (!nextPosition) {
      return undefined
    }
    return previewNextSampling(pile, masterData, nextPosition)
  }, [nextPosition, pile, masterData])

  function handleFrontChange(fleetId: string) {
    setSelectedFleetId(fleetId)
    setSelectedTruckId('')
    setRecordErrorCode(undefined)
  }

  function handleTruckChange(truckId: string) {
    setSelectedTruckId(truckId)
    setRecordErrorCode(undefined)
  }

  async function handleRecord() {
    if (isSubmittingRef.current) {
      return
    }
    if (!nextPosition || !selectedFleetId || !selectedTruckId) {
      return
    }

    // Defensive re-check, independent of HaulageEntryForm's own `disabled`
    // state: the selected Fleet/Truck must still be current against the
    // latest resolved options. A FleetSetup change (e.g. a truck removed
    // from the fleet) can leave stale ids in local state without the
    // operator having touched the selects again. This must run before
    // `generateTransactionId()` — no id is generated, no domain call is
    // made, and nothing is written when the selection is stale.
    const currentFrontOptions = frontOptionsResult.ok ? frontOptionsResult.value : []
    if (!isFrontTruckSelectionCurrent(currentFrontOptions, selectedFleetId, selectedTruckId)) {
      setRecordErrorCode('HAULAGE_OPERATIONAL_CONTEXT_INVALID')
      return
    }

    isSubmittingRef.current = true
    setSaving(true)
    setRecordErrorCode(undefined)
    setSuccessMessage(undefined)

    try {
      const created = recordHaulage({
        generatedTransactionId: generateTransactionId(),
        shift,
        pile,
        nextPosition,
        selectedFleetId,
        selectedTruckId,
        masterData,
        fleetSetup,
      })
      if (!created.ok) {
        setRecordErrorCode(created.error.code)
        return
      }

      const saved = await store.addHaulageTransaction(created.value)
      if (!saved.ok) {
        setRecordErrorCode(saved.error.code)
        return
      }

      const recordedTransaction = created.value
      setPhase((current) =>
        current.kind === 'loaded'
          ? { kind: 'loaded', transactions: [...current.transactions, recordedTransaction] }
          : current,
      )
      setSelectedTruckId('')
      setSuccessMessage(t('pileHaulage.recordedFeedback', { rit: Number(nextPosition.ritNumber) }))
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={t('pileHaulage.title')} />
        <div className="px-4 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('pileHaulage.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('pileHaulage.title')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t(loadErrorTranslationKey(phase.code))}</p>
              <Button type="button" onClick={handleRetry}>
                {t('pileHaulage.retry')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const planErrorCode = !frontOptionsResult.ok
    ? frontOptionsResult.error.code
    : progressResult && !progressResult.ok
      ? progressResult.error.code
      : samplingPreviewResult && !samplingPreviewResult.ok
        ? samplingPreviewResult.error.code
        : undefined

  const progress = progressResult && progressResult.ok ? progressResult.value : undefined

  return (
    <div>
      <PageHeader title={t('pileHaulage.title')} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {planErrorCode ? (
          <Card>
            <CardContent role="alert">
              <p>{t(pileHaulageErrorTranslationKey(planErrorCode))}</p>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && progress?.nextPosition && samplingPreviewResult?.ok ? (
          <>
            <PileOperationalHeader
              pile={pile}
              nextPosition={progress.nextPosition}
              batchSize={samplingPreviewResult.value.batchSize}
              samplingEvaluation={samplingPreviewResult.value.samplingEvaluation}
            />

            {successMessage ? (
              <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            {recordErrorCode ? (
              <p role="alert" className="text-sm text-red-600">
                {t(pileHaulageErrorTranslationKey(recordErrorCode))}
              </p>
            ) : null}

            <HaulageEntryForm
              frontOptions={frontOptionsResult.ok ? frontOptionsResult.value : []}
              selectedFleetId={selectedFleetId}
              selectedTruckId={selectedTruckId}
              onFrontChange={handleFrontChange}
              onTruckChange={handleTruckChange}
              onSubmit={() => void handleRecord()}
              saving={saving}
              isSample={samplingPreviewResult.value.samplingEvaluation.sampleRequired}
            />
          </>
        ) : null}

        {!planErrorCode && progress && !progress.nextPosition ? (
          <Card>
            <CardContent>
              <p>{t('pileHaulage.planExhausted')}</p>
            </CardContent>
          </Card>
        ) : null}

        {progress ? <SkippedHaulageList skippedPositions={progress.skippedPositions} /> : null}
        {progress ? <RecordedHaulageList recordedPositions={progress.recordedPositions} /> : null}
      </div>
    </div>
  )
}
