import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { operationalFleetOptionsForPile } from '@/application/haulage-operation/operational-fleet-options'
import { editProductionRecord } from '@/application/production/edit-production-record'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchableCombobox } from '@/components/shared/SearchableCombobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'
import { parseHaulageTransactionId } from '@/domain/common/identifiers'
import {
  CONTAMINATIONS,
  DISPOSITIONS,
  PHYSICAL_CONDITIONS,
  type Contamination,
  type Disposition,
  type PhysicalCondition,
  type ProductionRecord,
} from '@/domain/production/production-record'
import { productionCorrectionErrorTranslationKey } from '@/features/production/production-correction-error-messages'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly productionRecords: readonly ProductionRecord[] }

/**
 * Edit Record (Phase 4 §4-§8): edits the selected ProductionRecord's
 * Front No/Truck/Physical Condition/Contamination/Disposition/Keterangan.
 * Batch/Rit is never editable here (`§4` — Switch Record is the only
 * mechanism that may change it) and Pile_ID/Transaction_ID never change
 * (they live on the immutable `transaction`, not touched by this screen).
 */
export function ProductionEditRecordPage() {
  const { t } = useTranslation('production')
  const navigate = useNavigate()
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId, batchNumber, ritNumber } = useParams<{ pileId: string; batchNumber: string; ritNumber: string }>()
  const [searchParams] = useSearchParams()
  const transactionIdParam = searchParams.get('tx') ?? ''

  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
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
  const record =
    phase.kind === 'loaded' && transactionIdResult.ok
      ? phase.productionRecords.find((candidate) => candidate.transaction.id === transactionIdResult.value)
      : undefined

  const [selectedFrontId, setSelectedFrontId] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [truckQuery, setTruckQuery] = useState('')
  const [physicalCondition, setPhysicalCondition] = useState<PhysicalCondition>('DRY')
  const [contamination, setContamination] = useState<Contamination>('CLN')
  const [disposition, setDisposition] = useState<Disposition>('ACCEPT')
  const [remark, setRemark] = useState('')
  const [reason, setReason] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()

  useEffect(() => {
    if (record && !initialized) {
      setSelectedFrontId(record.effective.frontId as string)
      setSelectedTruckId(record.effective.truckId as string)
      setPhysicalCondition(record.effective.physicalCondition ?? 'DRY')
      setContamination(record.effective.contamination ?? 'CLN')
      setDisposition(record.effective.disposition)
      setRemark(record.effective.remark ?? '')
      setInitialized(true)
    }
  }, [record, initialized])

  const checkerResult = useMemo(() => resolveProductionRecorder(workspace.manpower), [workspace.manpower])

  const frontOptionsResult = useMemo(
    () => (pile ? operationalFleetOptionsForPile(workspace.masterData, workspace.fleetSetup, pile.id) : undefined),
    [pile, workspace.masterData, workspace.fleetSetup],
  )
  const frontOptions = frontOptionsResult?.ok ? frontOptionsResult.value : []
  const selectedFrontOption = frontOptions.find((option) => (option.frontId as string) === selectedFrontId)
  const effectiveTruckIds = (selectedFrontOption?.effectiveTruckIds ?? []).map((truckId) => truckId as string)
  const allTruckIds = workspace.masterData.trucks.map((truck) => truck.id as string)

  const truckSearchOptions = useMemo(() => {
    const normalized = truckQuery.trim().toLowerCase()
    if (!normalized) return []
    const effectiveSet = new Set(effectiveTruckIds)
    const matches = allTruckIds.filter((truckId) => truckId.toLowerCase().includes(normalized))
    const ranked = [...matches].sort((a, b) => Number(effectiveSet.has(b)) - Number(effectiveSet.has(a)))
    return ranked.map((truckId) => ({ value: truckId, label: truckId }))
  }, [allTruckIds, effectiveTruckIds, truckQuery])

  const headerTitle = t('editRecord.headerTitle', {
    pileId: pileId ?? '',
    batchNumber: Number(batchNumber),
    ritNumber: Number(ritNumber),
  })

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

  if (!pile || phase.kind === 'error' || !record) {
    return (
      <div>
        <PageHeader title={headerTitle} />
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-red-700">
            {t('editRecord.notFound')}
          </p>
        </div>
      </div>
    )
  }

  const canSubmit =
    !saving &&
    !!selectedFrontOption &&
    selectedTruckId.length > 0 &&
    reason.trim().length > 0 &&
    checkerResult.ok

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || !selectedFrontOption || !checkerResult.ok || phase.kind !== 'loaded' || !record) {
      return
    }
    setSaving(true)
    setErrorCode(undefined)
    try {
      const edited = editProductionRecord({
        record,
        allRecordsForShift: phase.productionRecords,
        masterData: workspace.masterData,
        fleetSetup: workspace.fleetSetup,
        selectedFrontId,
        selectedTruckId,
        physicalCondition,
        contamination,
        disposition,
        remark,
        reason,
        correctedAt: new Date(),
        correctedBy: checkerResult.value,
      })
      if (!edited.ok) {
        setErrorCode(edited.error.code)
        return
      }
      const persisted = await localOperationalStore.updateProductionRecordWithCorrection(edited.value)
      if (!persisted.ok) {
        setErrorCode(persisted.error.code)
        return
      }
      navigate(`/production/detail/${encodeURIComponent(pileId ?? '')}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('editRecord.title')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p className="text-sm font-semibold">{headerTitle}</p>

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

        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
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
          </label>

          <div className="flex flex-col gap-1.5">
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
                  onClick={() => setDisposition(value)}
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
                navigate(`/production/detail/${encodeURIComponent(pileId ?? '')}/batch/${Number(batchNumber)}/rit/${Number(ritNumber)}`)
              }
              disabled={saving}
            >
              {t('editRecord.cancel')}
            </Button>
            <Button type="submit" size="lg" className="h-14" disabled={!canSubmit}>
              {saving ? t('editRecord.saving') : t('editRecord.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
