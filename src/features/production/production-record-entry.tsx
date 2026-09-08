import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { deriveExpectedRitsForBatch, derivePileHaulagePlan } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { deriveHaulageProgress } from '@/application/haulage-operation/derive-haulage-progress'
import {
  generateHaulageTransactionId as defaultGenerateHaulageTransactionId,
  type HaulageTransactionIdGenerator,
} from '@/application/haulage-operation/haulage-id-generator'
import { previewNextSampling } from '@/application/haulage-operation/next-sampling-preview'
import { operationalFleetOptionsForPile } from '@/application/haulage-operation/operational-fleet-options'
import { selectEffectiveTransactions } from '@/application/production/effective-production'
import { deriveMissedRits } from '@/application/production/missed-rit'
import type { ProductionRecordStore } from '@/application/production/production-record-store'
import { recordProduction } from '@/application/production/record-production'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchableCombobox } from '@/components/shared/SearchableCombobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { Pile } from '@/domain/pile/pile'
import {
  CONTAMINATIONS,
  DISPOSITIONS,
  PHYSICAL_CONDITIONS,
  type Contamination,
  type Disposition,
  type PhysicalCondition,
  type ProductionRecord,
} from '@/domain/production/production-record'
import type { Shift } from '@/domain/shift/shift'
import {
  productionRecordErrorTranslationKey,
  productionRecordLoadErrorTranslationKey,
} from '@/features/production/production-record-error-messages'

export interface ProductionRecordEntryProps {
  shift: Shift
  pile: Pile
  masterData: MasterData
  fleetSetup: FleetSetup
  manpower: readonly ManpowerAssignment[]
  pendingBatches: readonly PendingBatchCarryOver[]
  /**
   * Missed-Rit correction target (Phase 3 §9): when set, this exact
   * Batch/Rit is recorded instead of the auto-derived next position, and
   * the normal "plan exhausted" gating is skipped — a past gap may still
   * need filling even once the forward plan is otherwise exhausted. The
   * target is re-validated as still MISSED (from the freshly loaded
   * ProductionRecord history) before it may be saved; if it is no longer
   * missed (e.g. already corrected elsewhere), saving is blocked with an
   * explicit message rather than silently falling back to the
   * auto-derived next position. This is never a manual Rit input — the
   * caller (route/query context) supplies it, the operator never types
   * it.
   */
  targetPosition?: BatchPosition
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: ProductionRecordStore
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  generateTransactionId?: HaulageTransactionIdGenerator
  /** Injectable so tests can supply a fixed clock instead of `new Date()`. */
  now?: () => Date
}

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

/**
 * The Production Record entry screen (Phase 2 — Production Record final
 * UI + write flow): a single screen for one Pile that lets the operator
 * pick Front No/Truck, record Physical Condition/Contamination/
 * Disposition/Keterangan, and save. Batch/Rit are never manual input —
 * they are derived automatically from the effective (ACCEPT + ACTIVE)
 * ProductionRecord history via `derivePileHaulagePlan`/
 * `deriveHaulageProgress` (the same engines the Pile Haulage checker
 * used, now filtered through `selectEffectiveTransactions` so a REJECT
 * never advances the position). ACCEPT saves immediately; REJECT always
 * requires an explicit confirmation step before anything is persisted.
 * Both dispositions persist through the single atomic
 * `store.addProductionTransaction` write path — this screen never calls
 * a HaulageTransaction-only save.
 */
export function ProductionRecordEntry({
  shift,
  pile,
  masterData,
  fleetSetup,
  manpower,
  pendingBatches,
  targetPosition,
  store,
  generateTransactionId = defaultGenerateHaulageTransactionId,
  now = () => new Date(),
}: ProductionRecordEntryProps) {
  const { t } = useTranslation('production')
  const navigate = useNavigate()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedFrontId, setSelectedFrontId] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [truckQuery, setTruckQuery] = useState('')
  const [physicalCondition, setPhysicalCondition] = useState<PhysicalCondition | ''>('')
  const [contamination, setContamination] = useState<Contamination | ''>('')
  const [disposition, setDisposition] = useState<Disposition>('ACCEPT')
  const [remark, setRemark] = useState('')
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()
  const [successMessage, setSuccessMessage] = useState<string>()
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })

    void store.listProductionRecordsForShiftPile(shift.id, pile.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', productionRecords: result.value } : { kind: 'error', code: result.error.code })
    })

    return () => {
      cancelled = true
    }
  }, [store, shift.id, pile.id, reloadToken])

  const handleRetry = useCallback(() => setReloadToken((token) => token + 1), [])

  const checkerResult = useMemo(() => resolveProductionRecorder(manpower), [manpower])

  const frontOptionsResult = useMemo(
    () => operationalFleetOptionsForPile(masterData, fleetSetup, pile.id),
    [masterData, fleetSetup, pile.id],
  )
  const frontOptions = frontOptionsResult.ok ? frontOptionsResult.value : []
  const selectedFrontOption = frontOptions.find((option) => (option.frontId as string) === selectedFrontId)

  const planResult = useMemo(
    () => derivePileHaulagePlan(pile, masterData, pendingBatches, pile.freshPileStartPosition),
    [pile, masterData, pendingBatches],
  )

  const progressResult = useMemo(() => {
    if (phase.kind !== 'loaded' || !planResult.ok) {
      return undefined
    }
    return deriveHaulageProgress({
      shiftId: shift.id,
      pileId: pile.id,
      expectedPositions: planResult.value,
      transactions: selectEffectiveTransactions(phase.productionRecords),
    })
  }, [phase, planResult, shift.id, pile.id])

  const nextPosition = progressResult && progressResult.ok ? progressResult.value.nextPosition : undefined

  const missedRitsForTargetBatch = useMemo(() => {
    if (!targetPosition || phase.kind !== 'loaded') return []
    const oreSamplingConfig = findOreSamplingConfig(masterData, pile.oreCode)
    if (!oreSamplingConfig) return []
    // Bounded to this Batch's own authoritative expected Rits (carry-
    // over/fresh-start-aware), never an invented `1..maxAccepted` range
    // — see `deriveExpectedRitsForBatch`.
    const expectedRitsResult = deriveExpectedRitsForBatch(
      pile,
      oreSamplingConfig.batchSize,
      pendingBatches,
      targetPosition.batchNumber,
      pile.freshPileStartPosition,
    )
    if (!expectedRitsResult.ok) return []
    return deriveMissedRits(phase.productionRecords, pile.id, targetPosition.batchNumber, expectedRitsResult.value)
  }, [targetPosition, phase, pile, masterData, pendingBatches])

  const targetStillMissed = targetPosition
    ? missedRitsForTargetBatch.some((rit) => Number(rit) === Number(targetPosition.ritNumber))
    : false

  // In missed-correction mode, this exact target replaces the
  // auto-derived next position — never a manual Rit input, and re-
  // validated as still MISSED on every render from the freshly loaded
  // ProductionRecord history.
  const recordingPosition = targetPosition ? (targetStillMissed ? targetPosition : undefined) : nextPosition

  const samplingPreviewResult = useMemo(() => {
    if (!recordingPosition) return undefined
    return previewNextSampling(pile, masterData, recordingPosition)
  }, [recordingPosition, pile, masterData])

  const allTruckIds = useMemo(() => masterData.trucks.map((truck) => truck.id as string), [masterData])
  const effectiveTruckIds = useMemo(
    () => (selectedFrontOption?.effectiveTruckIds ?? []).map((truckId) => truckId as string),
    [selectedFrontOption],
  )

  const truckSearchOptions = useMemo(() => {
    const normalized = truckQuery.trim().toLowerCase()
    if (!normalized) return []
    const effectiveSet = new Set(effectiveTruckIds)
    const matches = allTruckIds.filter((truckId) => truckId.toLowerCase().includes(normalized))
    const ranked = [...matches].sort((a, b) => Number(effectiveSet.has(b)) - Number(effectiveSet.has(a)))
    return ranked.map((truckId) => ({ value: truckId, label: truckId }))
  }, [allTruckIds, effectiveTruckIds, truckQuery])

  function resetFormFields() {
    setSelectedTruckId('')
    setTruckQuery('')
    setPhysicalCondition('')
    setContamination('')
    setDisposition('ACCEPT')
    setRemark('')
    setConfirmingReject(false)
  }

  const canSubmit =
    !saving &&
    !!recordingPosition &&
    !!selectedFrontOption &&
    selectedTruckId.length > 0 &&
    physicalCondition !== '' &&
    contamination !== '' &&
    checkerResult.ok

  async function handleSave() {
    if (isSubmittingRef.current) {
      return
    }
    if (!recordingPosition || !selectedFrontOption || !selectedTruckId || !physicalCondition || !contamination) {
      return
    }
    if (!checkerResult.ok) {
      setErrorCode(checkerResult.error.code)
      return
    }

    isSubmittingRef.current = true
    setSaving(true)
    setErrorCode(undefined)
    setSuccessMessage(undefined)

    try {
      const built = recordProduction({
        generatedTransactionId: generateTransactionId(),
        shift,
        pile,
        nextPosition: recordingPosition,
        selectedFleetId: selectedFrontOption.fleetId as string,
        selectedTruckId,
        masterData,
        fleetSetup,
        physicalCondition,
        contamination,
        disposition,
        remark,
        createdAt: now(),
        createdBy: checkerResult.value,
      })
      if (!built.ok) {
        setErrorCode(built.error.code)
        return
      }

      const saved = await store.addProductionTransaction(built.value)
      if (!saved.ok) {
        setErrorCode(saved.error.code)
        return
      }

      const savedDisposition = disposition
      const batch = Number(recordingPosition.batchNumber)
      const rit = Number(recordingPosition.ritNumber)
      const savedRecord = built.value.productionRecord
      setPhase((current) =>
        current.kind === 'loaded'
          ? { kind: 'loaded', productionRecords: [...current.productionRecords, savedRecord] }
          : current,
      )
      resetFormFields()
      setSuccessMessage(
        savedDisposition === 'ACCEPT'
          ? t('record.acceptedFeedback', { batch, rit })
          : t('record.rejectedFeedback', { batch, rit }),
      )
    } finally {
      isSubmittingRef.current = false
      setSaving(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    if (disposition === 'REJECT') {
      setConfirmingReject(true)
      return
    }
    void handleSave()
  }

  function handleDispositionChange(next: Disposition) {
    setDisposition(next)
    setConfirmingReject(false)
  }

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={t('record.title', { pileId: pile.id })} />
        <div className="px-5 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('record.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('record.title', { pileId: pile.id })} />
        <div className="px-5 py-4">
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t(productionRecordLoadErrorTranslationKey(phase.code))}</p>
              <Button type="button" onClick={handleRetry}>
                {t('record.retry')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // In missed-correction mode the forward plan/progress is irrelevant —
  // a past gap may still need filling even once the forward plan is
  // otherwise exhausted or invalid — so only a genuine sampling-config
  // failure (which would block any save regardless of mode) surfaces
  // here; "no longer missed" is handled as its own explicit message
  // below, never folded into this generic plan-error banner.
  const planErrorCode = targetPosition
    ? samplingPreviewResult && !samplingPreviewResult.ok
      ? samplingPreviewResult.error.code
      : undefined
    : !planResult.ok
      ? planResult.error.code
      : progressResult && !progressResult.ok
        ? progressResult.error.code
        : samplingPreviewResult && !samplingPreviewResult.ok
          ? samplingPreviewResult.error.code
          : undefined

  const batch = recordingPosition ? Number(recordingPosition.batchNumber) : undefined
  const rit = recordingPosition ? Number(recordingPosition.ritNumber) : undefined

  return (
    <div>
      <PageHeader title={t('record.title', { pileId: pile.id })} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{pile.id}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pile.oreCode}</span>
        </div>

        {planErrorCode ? (
          <Card>
            <CardContent role="alert">
              <p>{t(productionRecordErrorTranslationKey(planErrorCode))}</p>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && !recordingPosition && !targetPosition ? (
          <Card>
            <CardContent>
              <p>{t('record.planExhausted')}</p>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && !recordingPosition && targetPosition ? (
          <Card>
            <CardContent role="alert">
              <p>{t('record.missedCorrection.noLongerMissed')}</p>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && recordingPosition && targetPosition ? (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {t('record.missedCorrection.banner', { batch, rit })}
          </p>
        ) : null}

        {!checkerResult.ok ? (
          <Card>
            <CardContent role="alert">
              <p>{t(productionRecordErrorTranslationKey(checkerResult.error.code))}</p>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && recordingPosition && confirmingReject ? (
          <Card role="alertdialog" aria-labelledby="confirm-reject-title">
            <CardContent className="flex flex-col gap-3">
              <h2 id="confirm-reject-title" className="text-lg font-bold">
                {t('record.confirmReject.title')}
              </h2>
              <div>
                <p className="font-semibold">{pile.id}</p>
                <p className="text-sm text-muted-foreground">
                  {t('record.batch')} {batch} • {t('record.rit')} {rit}
                </p>
                <p className="text-sm text-muted-foreground">{selectedTruckId}</p>
              </div>
              <p className="text-sm">{t('record.confirmReject.notice')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="secondary" onClick={() => setConfirmingReject(false)} disabled={saving}>
                  {t('record.confirmReject.cancel')}
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? t('record.saving') : t('record.confirmReject.confirm')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!planErrorCode && recordingPosition && !confirmingReject ? (
          <>
            <Card>
              <CardContent className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('record.batch')}</p>
                  <p className="text-2xl font-bold">{batch}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('record.rit')}</p>
                  <p className="text-2xl font-bold">{rit}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('record.sample')}</p>
                  <p className="text-2xl font-bold">
                    {samplingPreviewResult?.ok && samplingPreviewResult.value.samplingEvaluation.sampleRequired ? '✓' : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {successMessage ? (
              <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            {errorCode ? (
              <p role="alert" className="text-sm text-red-600">
                {t(productionRecordErrorTranslationKey(errorCode))}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('record.selectFront')}
                <select
                  value={selectedFrontId}
                  onChange={(event) => setSelectedFrontId(event.target.value)}
                  className="h-12 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('record.selectFrontPlaceholder')}</option>
                  {frontOptions.map((option) => (
                    <option key={option.frontId} value={option.frontId as string}>
                      {option.frontId}
                    </option>
                  ))}
                </select>
                {frontOptions.length === 0 ? <p className="text-sm text-muted-foreground">{t('record.noFront')}</p> : null}
              </label>

              <div className="flex flex-col gap-1.5">
                {!selectedTruckId && effectiveTruckIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {effectiveTruckIds.map((truckId) => (
                      <button
                        key={truckId}
                        type="button"
                        onClick={() => setSelectedTruckId(truckId)}
                        className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
                      >
                        {truckId}
                      </button>
                    ))}
                  </div>
                ) : null}
                <SearchableCombobox
                  label={t('record.truck')}
                  query={truckQuery}
                  onQueryChange={setTruckQuery}
                  options={truckSearchOptions}
                  onSelect={(option) => {
                    setSelectedTruckId(option.value)
                    setTruckQuery('')
                  }}
                  selectedLabel={selectedTruckId || undefined}
                  clearLabel={t('record.changeTruck')}
                  onClearSelection={() => setSelectedTruckId('')}
                  placeholder={t('record.searchTruckPlaceholder')}
                  noResultsContent={<p className="text-sm text-muted-foreground">{t('record.noTruckFound')}</p>}
                />
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">{t('record.physicalCondition')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {PHYSICAL_CONDITIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={physicalCondition === value}
                      onClick={() => setPhysicalCondition(value)}
                      className={cn(
                        'h-11 rounded-lg border text-sm font-medium',
                        physicalCondition === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground',
                      )}
                    >
                      {t(`record.physicalConditionOptions.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">{t('record.contamination')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CONTAMINATIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={contamination === value}
                      onClick={() => setContamination(value)}
                      className={cn(
                        'h-11 rounded-lg border text-sm font-medium',
                        contamination === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground',
                      )}
                    >
                      {t(`record.contaminationOptions.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">{t('record.disposition')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {DISPOSITIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={disposition === value}
                      onClick={() => handleDispositionChange(value)}
                      className={cn(
                        'h-11 rounded-lg border text-sm font-semibold',
                        disposition === value
                          ? value === 'ACCEPT'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-red-600 bg-red-600 text-white'
                          : 'border-border bg-background text-foreground',
                      )}
                    >
                      {t(`record.dispositionOptions.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('record.remark')}
                <textarea
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder={t('record.remarkPlaceholder')}
                  rows={2}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="h-14"
                  onClick={() => navigate('/production?tab=record')}
                  disabled={saving}
                >
                  {t('record.cancel')}
                </Button>
                <Button type="submit" size="lg" className="h-14" disabled={!canSubmit}>
                  {saving ? t('record.saving') : t('record.save')}
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  )
}
