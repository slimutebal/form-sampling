import { useEffect, useMemo, useState } from 'react'
import { Pencil, ArrowLeftRight, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { deriveProductionRitViews } from '@/application/production/production-rit-view'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import { voidProductionRecord } from '@/application/production/void-production-record'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { findOreSamplingConfig } from '@/domain/master/master-data'
import type { ProductionRecord } from '@/domain/production/production-record'
import { productionCorrectionErrorTranslationKey } from '@/features/production/production-correction-error-messages'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * A fixed, language-independent audit timestamp format ("08 Sep 2026 •
 * 01:14") — deliberately not `Intl`-locale-dependent (some locales spell
 * September "Sept"), and deliberately in the viewer's local wall-clock
 * time (`Date.prototype.get*`, not UTC) since this is the operator's own
 * recorded-at moment, not a shift-scheduling date shown across devices.
 */
function formatRecordedAt(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = MONTH_ABBREVIATIONS[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} • ${hours}:${minutes}`
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

/**
 * Module-level (never redeclared per-render) — an inline function
 * component defined inside `ProductionRitDetailPage`'s own body would be
 * a *new* component type on every render, forcing React to unmount and
 * remount it (and its DOM, including this card's controlled `<textarea>`)
 * on every keystroke, which breaks typing entirely. Every value it needs
 * is passed as an explicit prop rather than captured via closure.
 */
function CorrectionIndicator({
  record,
  correctionsHref,
  correctedLabel,
  viewCorrectionsLabel,
}: {
  record: ProductionRecord
  correctionsHref: string
  correctedLabel: string
  viewCorrectionsLabel: string
}) {
  if (record.audit.corrections.length === 0) return null
  return (
    <div className="flex items-center justify-between">
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{correctedLabel}</span>
      <Link to={correctionsHref} className="text-xs font-semibold text-primary underline">
        {viewCorrectionsLabel}
      </Link>
    </div>
  )
}

interface VoidConfirmCardProps {
  readonly headerTitle: string
  readonly truckId: string
  readonly title: string
  readonly notice: string
  readonly reasonLabel: string
  readonly reasonPlaceholder: string
  readonly cancelLabel: string
  readonly confirmLabel: string
  readonly savingLabel: string
  readonly errorMessage: string | undefined
  readonly voidReason: string
  readonly onVoidReasonChange: (value: string) => void
  readonly voidSaving: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/** See `CorrectionIndicator`'s doc comment — module-level for the same reason (its `<textarea>` must never remount on keystroke). */
function VoidConfirmCard({
  headerTitle,
  truckId,
  title,
  notice,
  reasonLabel,
  reasonPlaceholder,
  cancelLabel,
  confirmLabel,
  savingLabel,
  errorMessage,
  voidReason,
  onVoidReasonChange,
  voidSaving,
  onCancel,
  onConfirm,
}: VoidConfirmCardProps) {
  return (
    <Card role="alertdialog" aria-labelledby="void-record-title" className="border-red-300 bg-red-50">
      <CardContent className="flex flex-col gap-3">
        <h2 id="void-record-title" className="text-lg font-bold">
          {title}
        </h2>
        <div>
          <p className="font-semibold">{headerTitle}</p>
          <p className="text-sm text-muted-foreground">{truckId}</p>
        </div>
        <p className="text-sm">{notice}</p>
        {errorMessage ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {reasonLabel}
          <textarea
            value={voidReason}
            onChange={(event) => onVoidReasonChange(event.target.value)}
            placeholder={reasonPlaceholder}
            rows={2}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={voidSaving}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={voidSaving || voidReason.trim().length === 0}>
            {voidSaving ? savingLabel : confirmLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The Record/Rit Detail screen (Phase 3 §8/§9/§11; Phase 4 §2/§21/§22/§26
 * correction actions). One route serving three states for the same
 * Pile/Batch/Rit position:
 *  - an ACCEPT + ACTIVE record: full field detail plus compact Edit/
 *    Switch/Delete icon actions;
 *  - MISSED (no ACCEPT here, a later Rit is already recorded): every
 *    REJECT attempt at this position (read-only, no Edit/Delete — Phase
 *    4 §2/§26), plus "Record Rit Ini"/"Switch Existing Record";
 *  - open/not-yet-reached (no ACCEPT, not missed): every REJECT attempt
 *    gets its own compact Edit/Delete actions (Switch never — Phase 4
 *    §26), since it is itself a correctable ProductionRecord.
 * Any VOIDED record for this position remains reachable via a compact
 * "Riwayat Koreksi" link (Phase 4 §20 "remains visible in History/Audit"),
 * even once it no longer fills `acceptedRecord`/`rejectAttempts`.
 */
export function ProductionRitDetailPage() {
  const { t } = useTranslation('production')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId, batchNumber: batchNumberParam, ritNumber: ritNumberParam } = useParams<{
    pileId: string
    batchNumber: string
    ritNumber: string
  }>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const batchNumberResult = parseBatchNumber(Number(batchNumberParam))
  const ritNumberResult = parseRitNumber(Number(ritNumberParam))
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [voidTarget, setVoidTarget] = useState<ProductionRecord | undefined>(undefined)
  const [voidReason, setVoidReason] = useState('')
  const [voidSaving, setVoidSaving] = useState(false)
  const [voidErrorCode, setVoidErrorCode] = useState<string>()

  useEffect(() => {
    if (!pile) return
    let cancelled = false
    void localOperationalStore.listProductionRecordsForShift(workspace.shift.id).then((result) => {
      if (cancelled) return
      setPhase(result.ok ? { kind: 'loaded', productionRecords: result.value } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [pile, workspace.shift.id, reloadToken])

  const batchNumber = batchNumberResult.ok ? batchNumberResult.value : undefined
  const ritNumber = ritNumberResult.ok ? ritNumberResult.value : undefined

  const ritView = useMemo(() => {
    if (phase.kind !== 'loaded' || !pile || !batchNumber || !ritNumber) return undefined
    const oreSamplingConfig = findOreSamplingConfig(workspace.masterData, pile.oreCode)
    if (!oreSamplingConfig) return undefined
    // Bounded to this Batch's own authoritative expected Rits (carry-
    // over/fresh-start-aware), never an invented `1..N` range.
    const expectedRitsResult = deriveExpectedRitsForBatch(
      pile,
      oreSamplingConfig.batchSize,
      workspace.pendingBatches,
      batchNumber,
      pile.freshPileStartPosition,
    )
    if (!expectedRitsResult.ok) return undefined
    return deriveProductionRitViews(phase.productionRecords, pile.id, batchNumber, expectedRitsResult.value).find(
      (view) => Number(view.ritNumber) === Number(ritNumber),
    )
  }, [phase, pile, batchNumber, ritNumber, workspace.masterData, workspace.pendingBatches])

  const checkerResult = useMemo(() => resolveProductionRecorder(workspace.manpower), [workspace.manpower])

  if (!pile || !batchNumberResult.ok || !ritNumberResult.ok) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t(pile ? 'rit.notFound' : 'errors.pileNotFound')}
          </p>
        </div>
      </div>
    )
  }

  const headerTitle = t('rit.headerTitle', {
    pileId: pile.id,
    batchNumber: Number(batchNumber),
    ritNumber: Number(ritNumber),
  })

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('batch.errors.loadFailed')}
          </p>
        </div>
      </div>
    )
  }

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

  if (!ritView) {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t('rit.notFound')}
          </p>
        </div>
      </div>
    )
  }

  const editHref = (record: ProductionRecord) =>
    `/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}/edit?tx=${encodeURIComponent(record.transaction.id as string)}`
  const switchHref = (record: ProductionRecord) =>
    `/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}/switch?tx=${encodeURIComponent(record.transaction.id as string)}`
  const switchIntoHref = `/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}/switch`
  const correctionsHref = (record: ProductionRecord) =>
    `/production/detail/${encodeURIComponent(pile.id as string)}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}/corrections?tx=${encodeURIComponent(record.transaction.id as string)}`

  async function handleConfirmVoid() {
    if (!voidTarget) return
    if (!checkerResult.ok) {
      setVoidErrorCode(checkerResult.error.code)
      return
    }
    setVoidSaving(true)
    setVoidErrorCode(undefined)
    try {
      const voided = voidProductionRecord({
        record: voidTarget,
        reason: voidReason,
        correctedAt: new Date(),
        correctedBy: checkerResult.value,
      })
      if (!voided.ok) {
        setVoidErrorCode(voided.error.code)
        return
      }
      const persisted = await localOperationalStore.voidProductionRecord(voided.value)
      if (!persisted.ok) {
        setVoidErrorCode(persisted.error.code)
        return
      }
      setVoidTarget(undefined)
      setVoidReason('')
      setReloadToken((token) => token + 1)
    } finally {
      setVoidSaving(false)
    }
  }

  if (voidTarget) {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="flex flex-col gap-3 px-5 py-4">
          <VoidConfirmCard
            headerTitle={headerTitle}
            truckId={voidTarget.effective.truckId as string}
            title={t('voidRecord.title')}
            notice={t('voidRecord.notice')}
            reasonLabel={t('correction.reasonLabel')}
            reasonPlaceholder={t('correction.reasonPlaceholder')}
            cancelLabel={t('voidRecord.cancel')}
            confirmLabel={t('voidRecord.confirm')}
            savingLabel={t('editRecord.saving')}
            errorMessage={voidErrorCode ? t(productionCorrectionErrorTranslationKey(voidErrorCode)) : undefined}
            voidReason={voidReason}
            onVoidReasonChange={setVoidReason}
            voidSaving={voidSaving}
            onCancel={() => {
              setVoidTarget(undefined)
              setVoidReason('')
              setVoidErrorCode(undefined)
            }}
            onConfirm={() => void handleConfirmVoid()}
          />
        </div>
      </div>
    )
  }

  if (ritView.acceptedRecord) {
    const record = ritView.acceptedRecord
    const physicalConditionValue = record.effective.physicalCondition
      ? `${record.effective.physicalCondition} — ${t(`record.physicalConditionOptions.${record.effective.physicalCondition}`)}`
      : t('rit.remarkEmpty')
    const contaminationValue = record.effective.contamination
      ? `${record.effective.contamination} — ${t(`record.contaminationOptions.${record.effective.contamination}`)}`
      : t('rit.remarkEmpty')
    const samplingValue = record.transaction.samplingEvaluation.sampleRequired
      ? t('rit.samplingRequired', { increment: Number(record.transaction.samplingEvaluation.incrementNumber) })
      : t('rit.samplingNotRequired')
    const truckValidationValue =
      record.effective.truckValidation.status === 'VALID'
        ? t('rit.truckValidationValid')
        : t('rit.truckValidationWrongTruck')

    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="flex flex-col gap-3 px-5 py-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <CorrectionIndicator
                record={record}
                correctionsHref={correctionsHref(record)}
                correctedLabel={t('rit.correctedBadge')}
                viewCorrectionsLabel={t('rit.viewCorrections')}
              />
              <LabelValue label={t('rit.truck')} value={record.effective.truckId as string} />
              <LabelValue label={t('rit.front')} value={record.effective.frontId as string} />
              <LabelValue label={t('rit.physicalCondition')} value={physicalConditionValue} />
              <LabelValue label={t('rit.contamination')} value={contaminationValue} />
              <LabelValue label={t('rit.disposition')} value={t(`record.dispositionOptions.${record.effective.disposition}`)} />
              <LabelValue label={t('rit.sampling')} value={samplingValue} />
              <LabelValue label={t('rit.truckValidation')} value={truckValidationValue} />
              <LabelValue label={t('rit.remark')} value={record.effective.remark ?? t('rit.remarkEmpty')} />
              <LabelValue
                label={t('rit.recordedBy')}
                value={record.audit.createdBy ? (record.audit.createdBy as string) : t('rit.recordedUnknown')}
              />
              <LabelValue
                label={t('rit.recordedAt')}
                value={record.audit.createdAt ? formatRecordedAt(record.audit.createdAt) : t('rit.recordedUnknown')}
              />
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="secondary" size="sm" className="flex-1 gap-1.5">
              <Link to={editHref(record)}>
                <Pencil aria-hidden="true" size={16} />
                {t('rit.actions.edit')}
              </Link>
            </Button>
            <Button asChild type="button" variant="secondary" size="sm" className="flex-1 gap-1.5">
              <Link to={switchHref(record)}>
                <ArrowLeftRight aria-hidden="true" size={16} />
                {t('rit.actions.switch')}
              </Link>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t('rit.actions.delete')}
              className="flex-1 gap-1.5 text-red-700"
              onClick={() => setVoidTarget(record)}
            >
              <Trash2 aria-hidden="true" size={16} />
              {t('rit.actions.delete')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isMissed = ritView.missed
  const recordHereHref = `/production/record/${encodeURIComponent(pile.id as string)}?batch=${Number(batchNumber)}&rit=${Number(ritNumber)}&mode=missed`

  return (
    <div>
      <PageHeader title={headerTitle} />
      <div className="flex flex-col gap-3 px-5 py-4">
        <Card className={isMissed ? 'border-amber-400 bg-amber-50' : undefined}>
          <CardContent className="flex flex-col gap-3">
            {isMissed ? (
              <>
                <p className="text-lg font-bold text-amber-900">{t('rit.missed.title')}</p>
                <p className="text-sm text-amber-900">{t('rit.missed.description')}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('rit.open.description')}</p>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t('rit.missed.attemptsTitle')}</p>
              {ritView.rejectAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('rit.missed.noAttempts')}</p>
              ) : (
                ritView.rejectAttempts.map((attempt) => (
                  <div key={attempt.transaction.id as string} className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {t('rit.missed.attemptLine', {
                        truckId: attempt.effective.truckId,
                        disposition: attempt.effective.disposition,
                        physicalCondition: attempt.effective.physicalCondition ?? '-',
                        contamination: attempt.effective.contamination ?? '-',
                      })}
                    </p>
                    {!isMissed ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link
                          to={editHref(attempt)}
                          aria-label={t('rit.actions.edit')}
                          className="rounded-md border border-border p-1.5 text-muted-foreground"
                        >
                          <Pencil aria-hidden="true" size={14} />
                        </Link>
                        <button
                          type="button"
                          aria-label={t('rit.actions.delete')}
                          className="rounded-md border border-border p-1.5 text-red-700"
                          onClick={() => setVoidTarget(attempt)}
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {ritView.voidedRecords.length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-dashed border-border pt-2">
                <p className="text-sm font-semibold">{t('rit.voidedTitle')}</p>
                {ritView.voidedRecords.map((voided) => (
                  <div key={voided.transaction.id as string} className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      {t('rit.voidedBadge')}
                    </span>
                    <Link to={correctionsHref(voided)} className="text-xs font-semibold text-primary underline">
                      {t('rit.viewCorrections')}
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}

            {isMissed ? (
              <div className="mt-2 flex flex-col gap-2">
                <Button asChild type="button" size="lg">
                  <Link to={recordHereHref}>{t('rit.missed.recordHere')}</Link>
                </Button>
                <Button asChild type="button" variant="secondary" size="lg" className="gap-1.5">
                  <Link to={switchIntoHref}>
                    <ArrowLeftRight aria-hidden="true" size={16} />
                    {t('rit.missed.switchExisting')}
                  </Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
