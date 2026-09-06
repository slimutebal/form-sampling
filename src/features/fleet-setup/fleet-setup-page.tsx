import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createFleetSetupFromDraft,
  type ValidatedFleetSetupDraft,
} from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { previewEffectiveFleet } from '@/application/fleet-setup/effective-fleet-preview'
import {
  generateFleetId as defaultGenerateFleetId,
  type FleetIdGenerator,
} from '@/application/fleet-setup/fleet-id-generator'
import {
  createEmptyFleetSetupDraftEntry,
  type FleetSetupDraftEntry,
} from '@/application/fleet-setup/fleet-setup-draft'
import type { CreatedSetupPileArea } from '@/application/pile-master/create-pile-area-for-setup'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { DomainError, Result } from '@/domain/common/result'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { fleetErrorTranslationKey } from '@/features/fleet-setup/error-messages'
import { FrontCard } from '@/features/fleet-setup/front-card'
import { FrontEditor } from '@/features/fleet-setup/front-editor'
import { FleetSetupSummary } from '@/features/fleet-setup/fleet-setup-summary'

export interface FleetSetupPageProps {
  shift: Shift
  masterData: MasterData
  onFleetSetupReady: (fleetSetup: FleetSetup) => void
  onBack?: () => void
  generateFleetId?: FleetIdGenerator
  /** New Pile Master creation from Fleet Setup (post-inspection correction §2) — see `FrontEditorProps.createNewPile`. */
  createNewPile?: (draft: NewPileDraft) => Promise<Result<CreatedSetupPileArea, DomainError>>
  /** Bubbles the merged MasterData up to the Start Shift orchestrator immediately after a new pile is created — see `FrontEditorProps.onMasterDataUpdated`. */
  onMasterDataUpdated?: (masterData: MasterData) => void
}

export function FleetSetupPage({
  shift,
  masterData,
  onFleetSetupReady,
  onBack,
  generateFleetId = defaultGenerateFleetId,
  createNewPile,
  onMasterDataUpdated,
}: FleetSetupPageProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<readonly FleetSetupDraftEntry[]>([])
  const [editing, setEditing] = useState<FleetSetupDraftEntry>()
  const [review, setReview] = useState<ValidatedFleetSetupDraft>()
  const [pageErrorKey, setPageErrorKey] = useState<string>()

  const previews = useMemo(
    () =>
      new Map(
        entries.map((entry) => {
          const result = previewEffectiveFleet(entries, shift, masterData, entry.fleetId)
          return [entry.fleetId, result] as const
        }),
      ),
    [entries, masterData, shift],
  )

  function handleSave(entry: FleetSetupDraftEntry) {
    const index = entries.findIndex((candidate) => candidate.fleetId === entry.fleetId)
    setEntries(
      index < 0
        ? [...entries, entry]
        : entries.map((candidate, itemIndex) => (itemIndex === index ? entry : candidate)),
    )
    setEditing(undefined)
    setReview(undefined)
    setPageErrorKey(undefined)
  }

  function handleRemove(entry: FleetSetupDraftEntry) {
    if (
      entries.some(
        (candidate) => candidate.kind === 'DERIVED' && candidate.referenceFleetId === entry.fleetId,
      )
    ) {
      setPageErrorKey(fleetErrorTranslationKey('FLEET_DEPENDENCY_EXISTS'))
      return
    }
    setEntries(entries.filter((candidate) => candidate.fleetId !== entry.fleetId))
    setReview(undefined)
    setPageErrorKey(undefined)
  }

  function handleReview() {
    const result = createFleetSetupFromDraft(entries, shift, masterData)
    if (!result.ok) {
      setReview(undefined)
      setPageErrorKey(fleetErrorTranslationKey(result.error.code))
      return
    }
    setReview(result.value)
    setPageErrorKey(undefined)
  }

  if (review) {
    return (
      <div>
        <PageHeader title={t('fleetSetup.title')} />
        <div className="px-4 py-4">
          <FleetSetupSummary
            sectorCode={shift.sectorCode}
            entries={entries}
            effectiveFleets={review.effectiveFleets}
            onEdit={() => setReview(undefined)}
            onContinue={() => onFleetSetupReady(review.fleetSetup)}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('fleetSetup.title')} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">{t('shiftStart.fields.date')}</dt>
              <dd className="break-all text-right font-medium">{shift.date}</dd>
              <dt className="text-muted-foreground">{t('shiftStart.fields.shiftCode')}</dt>
              <dd className="break-all text-right font-medium">{shift.shiftCode}</dd>
              <dt className="text-muted-foreground">{t('fleetSetup.sector')}</dt>
              <dd className="break-all text-right font-medium">{shift.sectorCode}</dd>
            </dl>
          </CardContent>
        </Card>

        {pageErrorKey ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {t(pageErrorKey)}
          </p>
        ) : null}

        {editing ? (
          <FrontEditor
            initialEntry={editing}
            entries={entries}
            shift={shift}
            masterData={masterData}
            onSave={handleSave}
            onCancel={() => setEditing(undefined)}
            createNewPile={createNewPile}
            onMasterDataUpdated={onMasterDataUpdated}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t('fleetSetup.fronts')}</h2>
              <Button
                type="button"
                onClick={() => setEditing(createEmptyFleetSetupDraftEntry(generateFleetId()))}
              >
                {t('fleetSetup.addFront')}
              </Button>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t('fleetSetup.noFronts')}
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {entries.map((entry) => {
                const preview = previews.get(entry.fleetId)
                const reference = entries.find(
                  (candidate) => candidate.fleetId === entry.referenceFleetId,
                )
                const destinationPileArea = entry.destinationPileId
                  ? masterData.pileAreas.find((pileArea) => pileArea.pileId === entry.destinationPileId)
                  : undefined
                return (
                  <FrontCard
                    key={entry.fleetId}
                    entry={entry}
                    sectorCode={shift.sectorCode}
                    effectiveTruckIds={preview?.ok ? preview.value : []}
                    previewErrorKey={
                      preview && !preview.ok
                        ? fleetErrorTranslationKey(preview.error.code)
                        : undefined
                    }
                    referenceFrontNumber={reference?.frontNumber}
                    destinationOreCode={destinationPileArea?.oreCode}
                    destinationStockpileCode={destinationPileArea?.stockpileCode}
                    onEdit={() => setEditing(entry)}
                    onRemove={() => handleRemove(entry)}
                  />
                )
              })}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" size="lg" className="w-full" onClick={handleReview}>
                {t('fleetSetup.review')}
              </Button>
              {onBack ? (
                <Button type="button" variant="secondary" className="w-full" onClick={onBack}>
                  {t('fleetSetup.back')}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
