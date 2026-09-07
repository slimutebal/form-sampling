import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdjustFrontFleetResult } from '@/application/fleet-setup/adjust-front-fleet'
import type { AppendFrontContinuationResult } from '@/application/fleet-setup/append-front-continuation'
import {
  generateFleetId as defaultGenerateFleetId,
  type FleetIdGenerator,
} from '@/application/fleet-setup/fleet-id-generator'
import type { ActivatedPile } from '@/application/pile-master/activate-new-pile'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import type { Pile } from '@/domain/pile/pile'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'
import { fleetActiveErrorTranslationKey } from '@/features/fleet/error-messages'
import { FrontContinuationEditor } from '@/features/fleet/front-continuation-editor'
import { FrontFleetAdjustmentEditor } from '@/features/fleet/front-fleet-adjustment-editor'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'

/** The smallest write shape this page needs from `LocalOperationalStore`. */
export interface FleetActivePageStore {
  appendFrontContinuation(
    shiftId: ShiftId,
    params: { readonly fleetSetup: FleetSetup; readonly activatePile?: Pile },
  ): Promise<Result<void, DomainError>>
  updateActiveFrontFleet(shiftId: ShiftId, fleetSetup: FleetSetup): Promise<Result<void, DomainError>>
}

export interface FleetActivePageProps {
  workspace: LocalShiftWorkspace
  /** Production callers pass the app-wide LocalOperationalStore singleton; tests pass a lightweight fake. */
  store: FleetActivePageStore
  /** Called after a continuation Front is successfully saved, so the caller can refresh the shared workspace context. */
  onFleetUpdated: () => void
  generateFleetId?: FleetIdGenerator
  /** Post-init New Pile Master creation for a continuation's Destination — omit to hide the "+ Add New Pile" fallback. */
  createNewPile?: (draft: NewPileDraft) => Promise<Result<ActivatedPile, DomainError>>
}

/**
 * The active-shift Fleet page (ROADMAP continuation rules §3): lists every
 * ACTIVE Front (independent lineages included) with its resolved
 * effective fleet, lets the operator start a new Front continuation when a
 * loading point moves, and shows every HISTORICAL Front read-only with the
 * Front that superseded it. Active/historical status and effective fleet
 * membership are both derived purely from the stored FleetSetup — no
 * separate status flag is read or written here.
 */
export function FleetActivePage({
  workspace,
  store,
  onFleetUpdated,
  generateFleetId = defaultGenerateFleetId,
  createNewPile,
}: FleetActivePageProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [fleetId, setFleetId] = useState(generateFleetId)
  const [expandedFrontIds, setExpandedFrontIds] = useState<ReadonlySet<string>>(new Set())
  const [adjustingFrontId, setAdjustingFrontId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()

  const fleetSetup = workspace.fleetSetup
  const lineage = useMemo(() => deriveFrontLineage(fleetSetup), [fleetSetup])

  const activeFronts = fleetSetup.fronts.filter((front) => lineage.activeFrontIds.includes(front.frontId))
  const historicalFronts = fleetSetup.fronts.filter((front) => lineage.historicalFrontIds.includes(front.frontId))
  const adjustingFront = adjustingFrontId ? activeFronts.find((front) => front.frontId === adjustingFrontId) : undefined

  function toggleExpanded(frontId: string) {
    setExpandedFrontIds((current) => {
      const next = new Set(current)
      if (next.has(frontId)) {
        next.delete(frontId)
      } else {
        next.add(frontId)
      }
      return next
    })
  }

  function openAddFront() {
    setFleetId(generateFleetId())
    setAdding(true)
    setErrorCode(undefined)
  }

  function cancelAddFront() {
    setAdding(false)
    setErrorCode(undefined)
  }

  async function handleSave(result: AppendFrontContinuationResult, activatePile?: Pile) {
    if (saving) return
    setSaving(true)
    setErrorCode(undefined)
    try {
      const saveResult = await store.appendFrontContinuation(workspace.shiftId, {
        fleetSetup: result.fleetSetup,
        activatePile,
      })
      if (!saveResult.ok) {
        setErrorCode(saveResult.error.code)
        return
      }
      setAdding(false)
      onFleetUpdated()
    } finally {
      setSaving(false)
    }
  }

  function openAdjustUnit(frontId: string) {
    setAdjustingFrontId(frontId)
    setErrorCode(undefined)
  }

  function cancelAdjustUnit() {
    setAdjustingFrontId(undefined)
    setErrorCode(undefined)
  }

  async function handleSaveAdjustment(result: AdjustFrontFleetResult) {
    if (saving) return
    setSaving(true)
    setErrorCode(undefined)
    try {
      const saveResult = await store.updateActiveFrontFleet(workspace.shiftId, result.fleetSetup)
      if (!saveResult.ok) {
        setErrorCode(saveResult.error.code)
        return
      }
      setAdjustingFrontId(undefined)
      onFleetUpdated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('fleetActive.title')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {errorCode ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {t(fleetActiveErrorTranslationKey(errorCode))}
          </p>
        ) : null}

        {adjustingFront ? (
          <FrontFleetAdjustmentEditor
            front={adjustingFront}
            masterData={workspace.masterData}
            fleetSetup={fleetSetup}
            onSave={(result) => void handleSaveAdjustment(result)}
            onCancel={cancelAdjustUnit}
          />
        ) : adding ? (
          <FrontContinuationEditor
            shift={workspace.shift}
            masterData={workspace.masterData}
            fleetSetup={fleetSetup}
            workspacePiles={workspace.piles}
            fleetId={fleetId}
            createNewPile={createNewPile}
            onPileActivated={() => onFleetUpdated()}
            onSave={(result, activatePile) => void handleSave(result, activatePile)}
            onCancel={cancelAddFront}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t('fleetActive.activeFronts')}</h2>
              {/* Phase 18 §2: a brand-new independent BASE Front never
                  needs a reference, so "+ Tambah Front" stays enabled
                  even with zero active Fronts. */}
              <Button type="button" onClick={openAddFront}>
                {t('fleetActive.addFront')}
              </Button>
            </div>

            {activeFronts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t('fleetSetup.noFronts')}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {activeFronts.map((front) => {
                  const fleet = fleetSetup.fleets.find((candidate) => candidate.frontId === front.frontId)
                  const effective = fleet ? resolveEffectiveFleetAgainstMaster(workspace.masterData, fleetSetup, fleet.fleetId) : undefined
                  const truckIds = effective?.ok ? effective.value.truckIds : []
                  const referenceFrontId = lineage.predecessorFrontIdByFrontId.get(front.frontId)
                  const expanded = expandedFrontIds.has(front.frontId)
                  return (
                    <Card key={front.frontId}>
                      <CardHeader>
                        <CardTitle className="break-all">{front.frontId}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
                          {referenceFrontId ? (
                            <>
                              <dt className="text-muted-foreground">{t('fleetSetup.referenceFleet')}</dt>
                              <dd className="break-all text-right font-medium">
                                {t('fleetSetup.frontReference', { frontId: referenceFrontId })}
                              </dd>
                            </>
                          ) : null}
                          <dt className="text-muted-foreground">{t('fleetSetup.hauler')}</dt>
                          <dd className="break-all text-right font-medium">{front.haulerCode}</dd>
                          <dt className="text-muted-foreground">{t('fleetSetup.destinationPile')}</dt>
                          <dd className="break-all text-right font-medium">
                            {front.destinationPileId ?? t('fleetSetup.noReference')}
                          </dd>
                          <dt className="text-muted-foreground">{t('fleetActive.units')}</dt>
                          <dd className="break-all text-right font-medium">{truckIds.length}</dd>
                        </dl>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="secondary" onClick={() => toggleExpanded(front.frontId)}>
                            {expanded ? t('fleetActive.hideDetail') : t('fleetActive.detail')}
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => openAdjustUnit(front.frontId)}>
                            {t('fleetActive.adjustUnit')}
                          </Button>
                        </div>
                        {expanded ? <EffectiveFleetPreview truckIds={truckIds} /> : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            <h2 className="text-base font-semibold">{t('fleetActive.history')}</h2>
            {historicalFronts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t('fleetActive.noHistory')}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {historicalFronts.map((front) => {
                  const successorFrontId = lineage.successorFrontIdByFrontId.get(front.frontId)
                  return (
                    <Card key={front.frontId} className="bg-muted/40">
                      <CardContent className="flex flex-row items-center justify-between">
                        <span className="font-semibold">{front.frontId}</span>
                        <span className="text-sm text-muted-foreground">
                          {successorFrontId ? t('fleetActive.continuedBy', { frontId: successorFrontId }) : null}
                        </span>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
