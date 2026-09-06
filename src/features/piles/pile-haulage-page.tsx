import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HaulageTransactionStore } from '@/application/haulage-operation/haulage-transaction-store'
import { deriveCurrentBatchSampleCount } from '@/application/haulage-operation/current-batch-sample-count'
import { deriveHaulageProgress } from '@/application/haulage-operation/derive-haulage-progress'
import { previewNextSampling } from '@/application/haulage-operation/next-sampling-preview'
import type { OperationalFleetOption } from '@/application/haulage-operation/operational-fleet-options'
import { recordHaulage } from '@/application/haulage-operation/create-haulage-record'
import {
  generateHaulageTransactionId as defaultGenerateHaulageTransactionId,
  type HaulageTransactionIdGenerator,
} from '@/application/haulage-operation/haulage-id-generator'
import { confirmFreshPileStartPosition } from '@/application/pile-workspace/confirm-fresh-pile-start-position'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { DomainError, Result } from '@/domain/common/result'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { FreshPileStartPosition } from '@/domain/pile/fresh-pile-start-position'
import type { Pile } from '@/domain/pile/pile'
import type { Shift } from '@/domain/shift/shift'
import { loadErrorTranslationKey, pileHaulageErrorTranslationKey } from '@/features/piles/error-messages'
import { FreshPileStartPositionForm } from '@/features/piles/fresh-pile-start-position-form'
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
   * The single Front/Fleet this checker session operates on — resolved
   * and validated (exists, ACTIVE, destination matches `pile`) by the
   * caller (`PileDetailPage`, via `operationalFleetOptionForFront`)
   * before this component ever renders (Phase 18 §5). There is no Front
   * dropdown here — the operator already chose it on the Pile list.
   */
  frontOption: OperationalFleetOption
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
  /**
   * True when this Pile has no CONTINUE carry-over from handover
   * (post-inspection correction §6) — eligible for a confirmed fresh-pile
   * starting position. A handover/continuation Pile is never eligible,
   * so it never shows the Initial Position form.
   */
  freshPileEligible?: boolean
  /**
   * Persists a confirmed fresh-pile starting position and refreshes the
   * workspace so `pile`/`expectedPositions` reflect it on the next
   * render. This component only ever calls it after its own
   * `confirmFreshPileStartPosition` lock/range check passes.
   */
  onConfirmFreshPileStartPosition?: (startPosition: FreshPileStartPosition) => Promise<Result<void, DomainError>>
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
  frontOption,
  expectedPositions,
  store,
  generateTransactionId = defaultGenerateHaulageTransactionId,
  freshPileEligible = false,
  onConfirmFreshPileStartPosition,
}: PileHaulagePageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [saving, setSaving] = useState(false)
  const [recordErrorCode, setRecordErrorCode] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const [editingStartPosition, setEditingStartPosition] = useState(false)
  const [confirmingStartPosition, setConfirmingStartPosition] = useState(false)
  const [startPositionErrorCode, setStartPositionErrorCode] = useState<string>()
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

  const allTruckIds = useMemo(() => masterData.trucks.map((truck) => truck.id as string), [masterData])

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

  const sampleCount = useMemo(() => {
    if (!nextPosition || phase.kind !== 'loaded') {
      return undefined
    }
    const config = findOreSamplingConfig(masterData, pile.oreCode)
    if (!config) {
      return undefined
    }
    return deriveCurrentBatchSampleCount(phase.transactions, shift.id, pile.id, nextPosition.batchNumber, config)
  }, [nextPosition, phase, masterData, pile, shift.id])

  const existingTransactionCount = phase.kind === 'loaded' ? phase.transactions.length : 0
  // Once haulage exists for this Pile, the starting position is locked
  // (post-inspection correction §6) — no edit affordance survives that,
  // regardless of `editingStartPosition`'s stale local state.
  const canEditStartPosition = freshPileEligible && phase.kind === 'loaded' && existingTransactionCount === 0
  const needsInitialStartPosition = canEditStartPosition && !pile.freshPileStartPosition
  const startPositionFormVisible = needsInitialStartPosition || (canEditStartPosition && editingStartPosition)

  async function handleConfirmStartPosition(batchNumber: number, ritNumber: number) {
    if (!onConfirmFreshPileStartPosition) return
    const guarded = confirmFreshPileStartPosition({ batchNumber, ritNumber, existingTransactionCount })
    if (!guarded.ok) {
      setStartPositionErrorCode(guarded.error.code)
      return
    }
    setConfirmingStartPosition(true)
    setStartPositionErrorCode(undefined)
    try {
      const result = await onConfirmFreshPileStartPosition(guarded.value)
      if (!result.ok) {
        setStartPositionErrorCode(result.error.code)
        return
      }
      setEditingStartPosition(false)
    } finally {
      setConfirmingStartPosition(false)
    }
  }

  function handleTruckChange(truckId: string) {
    setSelectedTruckId(truckId)
    setRecordErrorCode(undefined)
  }

  async function handleRecord() {
    if (isSubmittingRef.current) {
      return
    }
    if (!nextPosition || !selectedTruckId) {
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
        selectedFleetId: frontOption.fleetId as string,
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

  const planErrorCode =
    progressResult && !progressResult.ok
      ? progressResult.error.code
      : samplingPreviewResult && !samplingPreviewResult.ok
        ? samplingPreviewResult.error.code
        : undefined

  const progress = progressResult && progressResult.ok ? progressResult.value : undefined

  return (
    <div>
      <PageHeader title={t('pileHaulage.title')} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {startPositionFormVisible ? (
          <FreshPileStartPositionForm
            initialBatchNumber={pile.freshPileStartPosition ? Number(pile.freshPileStartPosition.batchNumber) : 1}
            initialRitNumber={pile.freshPileStartPosition ? Number(pile.freshPileStartPosition.ritNumber) : 1}
            onConfirm={(batchNumber, ritNumber) => void handleConfirmStartPosition(batchNumber, ritNumber)}
            onCancel={pile.freshPileStartPosition ? () => setEditingStartPosition(false) : undefined}
            saving={confirmingStartPosition}
            errorKey={startPositionErrorCode ? pileHaulageErrorTranslationKey(startPositionErrorCode) : undefined}
          />
        ) : null}

        {!startPositionFormVisible && planErrorCode ? (
          <Card>
            <CardContent role="alert">
              <p>{t(pileHaulageErrorTranslationKey(planErrorCode))}</p>
            </CardContent>
          </Card>
        ) : null}

        {!startPositionFormVisible && !planErrorCode && progress?.nextPosition && samplingPreviewResult?.ok && sampleCount ? (
          <>
            <PileOperationalHeader
              pile={pile}
              frontId={frontOption.frontId}
              nextPosition={progress.nextPosition}
              batchSize={samplingPreviewResult.value.batchSize}
              samplingEvaluation={samplingPreviewResult.value.samplingEvaluation}
              sampleCount={sampleCount}
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
              effectiveTruckIds={frontOption.effectiveTruckIds}
              allTruckIds={allTruckIds}
              selectedTruckId={selectedTruckId}
              onTruckChange={handleTruckChange}
              onSubmit={() => void handleRecord()}
              saving={saving}
              isSample={samplingPreviewResult.value.samplingEvaluation.sampleRequired}
            />

            {canEditStartPosition ? (
              <Button type="button" variant="secondary" onClick={() => setEditingStartPosition(true)}>
                {t('pileHaulage.initialPosition.change')}
              </Button>
            ) : null}
          </>
        ) : null}

        {!startPositionFormVisible && !planErrorCode && progress && !progress.nextPosition ? (
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
