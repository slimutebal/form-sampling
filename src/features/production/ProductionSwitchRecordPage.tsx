import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { isEffectiveProductionRecord } from '@/application/production/effective-production'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import { deriveEffectiveSamplingRequirement, deriveSampleImpact } from '@/application/production/production-sample-impact'
import { deriveProductionSwitchTargets } from '@/application/production/production-switch-targets'
import {
  applyProductionSwitchPlan,
  planProductionSwitch,
  type ProductionSwitchPlan,
} from '@/application/production/switch-production-record'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { createBatchPosition, type BatchPosition } from '@/domain/batch/batch-position'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseHaulageTransactionId } from '@/domain/common/identifiers'
import type { ProductionRecord } from '@/domain/production/production-record'
import { productionCorrectionErrorTranslationKey } from '@/features/production/production-correction-error-messages'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'confirm'; readonly plan: ProductionSwitchPlan }

/**
 * Switch Record (Phase 4 §9-§15): the only mechanism that may change a
 * ProductionRecord's Batch/Rit position. Serves two entry points with the
 * identical underlying engine (`planProductionSwitch`):
 *  - from an ACCEPT + ACTIVE record's own detail (`?tx=` present, §11) —
 *    the SOURCE is fixed (this route's own Batch/Rit), the operator picks
 *    the TARGET Batch/Rit from the authoritative expected-position list;
 *  - from a MISSED position's "Switch Existing Record" (`?tx=` absent,
 *    §12) — the TARGET is fixed (this route's own Batch/Rit), the
 *    operator picks the SOURCE from the Pile's other ACCEPT + ACTIVE
 *    records.
 * MOVE vs SWAP is never an operator choice (§10) — `planProductionSwitch`
 * derives it from whether the target position is already occupied by an
 * ACCEPT + ACTIVE record.
 */
export function ProductionSwitchRecordPage() {
  const { t } = useTranslation('production')
  const navigate = useNavigate()
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId, batchNumber: batchNumberParam, ritNumber: ritNumberParam } = useParams<{
    pileId: string
    batchNumber: string
    ritNumber: string
  }>()
  const [searchParams] = useSearchParams()
  const transactionIdParam = searchParams.get('tx') ?? ''

  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const anchorBatchResult = parseBatchNumber(Number(batchNumberParam))
  const anchorRitResult = parseRitNumber(Number(ritNumberParam))

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.listProductionRecordsForShift(workspace.shift.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', productionRecords: result.value } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shift.id])

  const transactionIdResult = parseHaulageTransactionId(transactionIdParam)
  const mode: 'fromSource' | 'toTarget' = transactionIdResult.ok ? 'fromSource' : 'toTarget'

  const fixedSourceRecord =
    mode === 'fromSource' && phase.kind === 'loaded' && transactionIdResult.ok
      ? phase.productionRecords.find((candidate) => candidate.transaction.id === transactionIdResult.value)
      : undefined

  const sourceCandidates = useMemo(() => {
    if (mode !== 'toTarget' || phase.kind !== 'loaded' || !pile) return []
    return phase.productionRecords
      .filter((record) => record.transaction.pileId === pile.id && isEffectiveProductionRecord(record))
      .sort((a, b) => {
        const batchDiff = Number(a.effective.batchPosition.batchNumber) - Number(b.effective.batchPosition.batchNumber)
        return batchDiff !== 0 ? batchDiff : Number(a.effective.batchPosition.ritNumber) - Number(b.effective.batchPosition.ritNumber)
      })
  }, [mode, phase, pile])

  const [selectedSourceTx, setSelectedSourceTx] = useState('')
  const [targetBatchInput, setTargetBatchInput] = useState('')
  const [targetRitInput, setTargetRitInput] = useState('')
  const [reason, setReason] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()

  const sourceRecord =
    mode === 'fromSource'
      ? fixedSourceRecord
      : sourceCandidates.find((candidate) => (candidate.transaction.id as string) === selectedSourceTx)

  const switchTargetsResult = useMemo(() => {
    if (mode !== 'fromSource' || !pile || phase.kind !== 'loaded') return undefined
    return deriveProductionSwitchTargets(pile, workspace.masterData, phase.productionRecords, workspace.pendingBatches)
  }, [mode, pile, phase, workspace.masterData, workspace.pendingBatches])

  const targetBatchOptions = switchTargetsResult?.ok ? switchTargetsResult.value : []
  const selectedTargetBatchOption = targetBatchOptions.find(
    (option) => Number(option.batchNumber) === Number(targetBatchInput),
  )

  const targetPosition: BatchPosition | undefined = (() => {
    if (mode === 'fromSource') {
      if (!targetBatchInput || !targetRitInput) return undefined
      const batchResult = parseBatchNumber(Number(targetBatchInput))
      const ritResult = parseRitNumber(Number(targetRitInput))
      if (!batchResult.ok || !ritResult.ok) return undefined
      return createBatchPosition(batchResult.value, ritResult.value)
    }
    return anchorBatchResult.ok && anchorRitResult.ok
      ? createBatchPosition(anchorBatchResult.value, anchorRitResult.value)
      : undefined
  })()

  const headerTitle =
    mode === 'fromSource'
      ? t('switchRecord.headerTitleFrom', { pileId: pileId ?? '', batchNumber: Number(batchNumberParam), ritNumber: Number(ritNumberParam) })
      : t('switchRecord.headerTitleInto', { pileId: pileId ?? '', batchNumber: Number(batchNumberParam), ritNumber: Number(ritNumberParam) })

  const checkerResult = useMemo(() => resolveProductionRecorder(workspace.manpower), [workspace.manpower])

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('detail.loading')}</p>
        </div>
      </div>
    )
  }

  if (!pile || phase.kind === 'error' || (mode === 'fromSource' && !fixedSourceRecord)) {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t('switchRecord.notFound')}
          </p>
        </div>
      </div>
    )
  }

  function handlePreview() {
    if (!sourceRecord || !targetPosition || reason.trim().length === 0 || phase.kind !== 'loaded') {
      return
    }
    const plan = planProductionSwitch(sourceRecord, targetPosition, phase.productionRecords)
    if (!plan.ok) {
      setErrorCode(plan.error.code)
      return
    }
    setErrorCode(undefined)
    setStage({ kind: 'confirm', plan: plan.value })
  }

  const sampleImpactResult =
    stage.kind === 'confirm' && pile
      ? (() => {
          const before = deriveEffectiveSamplingRequirement(pile, workspace.masterData, stage.plan.sourceRecord.effective.batchPosition)
          const after = deriveEffectiveSamplingRequirement(pile, workspace.masterData, stage.plan.targetPosition)
          if (!before.ok) return before
          if (!after.ok) return after
          return { ok: true as const, value: deriveSampleImpact(before.value, after.value) }
        })()
      : undefined

  async function handleConfirm() {
    if (stage.kind !== 'confirm' || !checkerResult.ok) {
      return
    }
    setSaving(true)
    setErrorCode(undefined)
    try {
      const applied = applyProductionSwitchPlan({
        plan: stage.plan,
        reason,
        correctedAt: new Date(),
        correctedBy: checkerResult.value,
      })
      if (!applied.ok) {
        setErrorCode(applied.error.code)
        return
      }
      const persisted = await localOperationalStore.switchProductionRecords({
        updatedSource: applied.value.updatedSource,
        updatedTarget: applied.value.updatedTarget,
      })
      if (!persisted.ok) {
        setErrorCode(persisted.error.code)
        return
      }
      navigate(
        `/production/detail/${encodeURIComponent(pileId ?? '')}/batch/${Number(applied.value.updatedSource.effective.batchPosition.batchNumber)}/rit/${Number(applied.value.updatedSource.effective.batchPosition.ritNumber)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('switchRecord.title')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!checkerResult.ok ? (
          <Card>
            <CardContent role="alert">
              <p>{t(productionCorrectionErrorTranslationKey(checkerResult.error.code))}</p>
            </CardContent>
          </Card>
        ) : null}

        {errorCode ? (
          <p role="alert" className="text-sm text-red-600">
            {t(productionCorrectionErrorTranslationKey(errorCode))}
          </p>
        ) : null}

        {stage.kind === 'form' ? (
          <>
            {mode === 'fromSource' && fixedSourceRecord ? (
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('switchRecord.from')}</p>
                  <p className="text-sm font-semibold">
                    {pileId} {t('record.batch')} {Number(batchNumberParam)} {t('record.rit')} {Number(ritNumberParam)}
                  </p>
                  <p className="text-sm text-muted-foreground">{fixedSourceRecord.effective.truckId}</p>
                </CardContent>
              </Card>
            ) : null}

            {mode === 'toTarget' ? (
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('switchRecord.target')}</p>
                  <p className="text-sm font-semibold">
                    {pileId} {t('record.batch')} {Number(batchNumberParam)} {t('record.rit')} {Number(ritNumberParam)}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t('switchRecord.selectSource')}
                    <select
                      value={selectedSourceTx}
                      onChange={(event) => setSelectedSourceTx(event.target.value)}
                      className="h-12 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t('record.selectFrontPlaceholder')}</option>
                      {sourceCandidates.map((candidate) => (
                        <option key={candidate.transaction.id as string} value={candidate.transaction.id as string}>
                          {t('switchRecord.sourceOption', {
                            batch: Number(candidate.effective.batchPosition.batchNumber),
                            rit: Number(candidate.effective.batchPosition.ritNumber),
                            truckId: candidate.effective.truckId,
                          })}
                        </option>
                      ))}
                    </select>
                  </label>
                </CardContent>
              </Card>
            ) : null}

            {mode === 'fromSource' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('switchRecord.targetBatch')}
                  <select
                    value={targetBatchInput}
                    onChange={(event) => {
                      setTargetBatchInput(event.target.value)
                      setTargetRitInput('')
                    }}
                    className="h-12 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t('record.selectFrontPlaceholder')}</option>
                    {targetBatchOptions.map((option) => (
                      <option key={Number(option.batchNumber)} value={Number(option.batchNumber)}>
                        {Number(option.batchNumber)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('switchRecord.targetRit')}
                  <select
                    value={targetRitInput}
                    onChange={(event) => setTargetRitInput(event.target.value)}
                    disabled={!selectedTargetBatchOption}
                    className="h-12 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t('record.selectFrontPlaceholder')}</option>
                    {(selectedTargetBatchOption?.ritNumbers ?? []).map((rit) => (
                      <option key={Number(rit)} value={Number(rit)}>
                        {Number(rit)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {targetPosition && sourceRecord && phase.kind === 'loaded' ? (
              (() => {
                const preview = planProductionSwitch(sourceRecord, targetPosition, phase.productionRecords)
                return (
                  <Card>
                    <CardContent className="flex flex-col gap-1">
                      <p className="text-sm font-semibold">
                        {t('record.batch')} {Number(targetPosition.batchNumber)} {t('record.rit')} {Number(targetPosition.ritNumber)}
                      </p>
                      {preview.ok ? (
                        <p className={preview.value.mode === 'MOVE' ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-700'}>
                          {preview.value.mode === 'MOVE'
                            ? t('switchRecord.statusAvailable')
                            : t('switchRecord.statusOccupied', { truckId: preview.value.targetRecord?.effective.truckId ?? '' })}
                        </p>
                      ) : (
                        <p className="text-sm text-red-600">{t(productionCorrectionErrorTranslationKey(preview.error.code))}</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })()
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('correction.reasonLabel')}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('correction.reasonPlaceholder')}
                rows={2}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-14"
                onClick={() =>
                  navigate(`/production/detail/${encodeURIComponent(pileId ?? '')}/batch/${Number(batchNumberParam)}/rit/${Number(ritNumberParam)}`)
                }
              >
                {t('switchRecord.cancel')}
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-14"
                disabled={!sourceRecord || !targetPosition || reason.trim().length === 0}
                onClick={handlePreview}
              >
                {t('switchRecord.previewSwitch')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm font-semibold">
                  {t(stage.plan.mode === 'MOVE' ? 'switchRecord.modeMove' : 'switchRecord.modeSwap')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('switchRecord.sourceSummary', {
                    batch: Number(stage.plan.sourceRecord.effective.batchPosition.batchNumber),
                    rit: Number(stage.plan.sourceRecord.effective.batchPosition.ritNumber),
                    truckId: stage.plan.sourceRecord.effective.truckId,
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('switchRecord.targetSummary', {
                    batch: Number(stage.plan.targetPosition.batchNumber),
                    rit: Number(stage.plan.targetPosition.ritNumber),
                  })}
                </p>
              </CardContent>
            </Card>

            {sampleImpactResult && !sampleImpactResult.ok ? (
              <p role="alert" className="text-sm text-red-600">
                {t(productionCorrectionErrorTranslationKey(sampleImpactResult.error.code))}
              </p>
            ) : null}

            {sampleImpactResult?.ok && sampleImpactResult.value.changed ? (
              <Card className="border-amber-400 bg-amber-50">
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-amber-900">{t('switchRecord.sampleImpact.title')}</p>
                  <p className="text-sm text-amber-900">{t('switchRecord.sampleImpact.description')}</p>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-800">{t('switchRecord.sampleImpact.before')}</p>
                    <p className="text-sm font-semibold text-amber-900">
                      {t('switchRecord.sampleImpact.line', {
                        batch: Number(sampleImpactResult.value.before.batchNumber),
                        rit: Number(sampleImpactResult.value.before.ritNumber),
                        sample: sampleImpactResult.value.before.sampleRequired ? t('rit.samplingRequired', { increment: Number(sampleImpactResult.value.before.incrementNumber ?? 0) }) : t('rit.samplingNotRequired'),
                      })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-800">{t('switchRecord.sampleImpact.after')}</p>
                    <p className="text-sm font-semibold text-amber-900">
                      {t('switchRecord.sampleImpact.line', {
                        batch: Number(sampleImpactResult.value.after.batchNumber),
                        rit: Number(sampleImpactResult.value.after.ritNumber),
                        sample: sampleImpactResult.value.after.sampleRequired ? t('rit.samplingRequired', { increment: Number(sampleImpactResult.value.after.incrementNumber ?? 0) }) : t('rit.samplingNotRequired'),
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-amber-900">{t('switchRecord.sampleImpact.notice')}</p>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" size="lg" className="h-14" onClick={() => setStage({ kind: 'form' })} disabled={saving}>
                {t('switchRecord.cancel')}
              </Button>
              <Button type="button" size="lg" className="h-14" onClick={() => void handleConfirm()} disabled={saving || !checkerResult.ok}>
                {saving
                  ? t('editRecord.saving')
                  : sampleImpactResult?.ok && sampleImpactResult.value.changed
                    ? t('switchRecord.sampleImpact.proceed')
                    : t('switchRecord.confirm')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
