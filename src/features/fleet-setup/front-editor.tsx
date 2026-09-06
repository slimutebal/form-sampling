import { useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  availableAddedTruckIds,
  previewEffectiveFleet,
  truckOptionsForHauler,
} from '@/application/fleet-setup/effective-fleet-preview'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import {
  cloneFleetSetupDraftEntry,
  formatFrontId,
  type FleetSetupDraftEntry,
} from '@/application/fleet-setup/fleet-setup-draft'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { CreatedSetupPileArea } from '@/application/pile-master/create-pile-area-for-setup'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/shared/SearchableCombobox'
import type { DomainError, Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'
import { fleetErrorTranslationKey } from '@/features/fleet-setup/error-messages'
import { SelectedTrucks, TruckAction } from '@/features/fleet-setup/truck-action-controls'
import { NewPileForm } from '@/features/pile-master/new-pile-form'

interface FrontEditorProps {
  initialEntry: FleetSetupDraftEntry
  entries: readonly FleetSetupDraftEntry[]
  shift: Shift
  masterData: MasterData
  onSave: (entry: FleetSetupDraftEntry) => void
  onCancel: () => void
  /**
   * New Pile Master creation from Fleet Setup (post-inspection correction
   * §2) — production callers pass `createAppsScriptPileAreaForSetup`;
   * tests pass a fake. Omit to hide the "+ Tambah Pile Baru" action
   * entirely, mirroring `PilesListPageProps.createNewPile`.
   */
  createNewPile?: (draft: NewPileDraft) => Promise<Result<CreatedSetupPileArea, DomainError>>
  /**
   * Called immediately once a new Pile Master is created, with the
   * merged/re-validated MasterData, so the caller (FleetSetupPage →
   * StartPage) keeps this Front Editor's own `masterData` prop and the
   * eventual `initializeShiftWorkspace` snapshot in sync with the new pile
   * — never only a local copy inside this component.
   */
  onMasterDataUpdated?: (masterData: MasterData) => void
}

type ErrorTarget = 'frontNumber' | 'hauler' | 'reference' | 'destination' | 'global'

const ERROR_TARGETS: Readonly<Record<string, ErrorTarget>> = {
  FRONT_NUMBER_OUT_OF_RANGE: 'frontNumber',
  DUPLICATE_FRONT_ID: 'frontNumber',
  BLANK_HAULER_CODE: 'hauler',
  FRONT_HAULER_NOT_FOUND: 'hauler',
  FLEET_REFERENCE_REQUIRED: 'reference',
  FLEET_REFERENCE_NOT_FOUND: 'reference',
  FLEET_DESTINATION_PILE_NOT_FOUND: 'destination',
}

/** Front No is a closed selector, 1–25 (Phase 18 §5) — never free text. */
const FRONT_NUMBER_OPTIONS: readonly string[] = Array.from({ length: 25 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

function errorTarget(code: string | undefined): ErrorTarget | undefined {
  return code ? (ERROR_TARGETS[code] ?? 'global') : undefined
}

function FieldError({ id, errorCode }: { id: string; errorCode?: string }) {
  const { t } = useTranslation()
  return errorCode ? (
    <p id={id} role="alert" className="text-sm text-red-700">
      {t(fleetErrorTranslationKey(errorCode))}
    </p>
  ) : null
}

export function FrontEditor({
  initialEntry,
  entries,
  shift,
  masterData,
  onSave,
  onCancel,
  createNewPile,
  onMasterDataUpdated,
}: FrontEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => cloneFleetSetupDraftEntry(initialEntry))
  const [selectedBaseTruck, setSelectedBaseTruck] = useState('')
  const [selectedAddTruck, setSelectedAddTruck] = useState('')
  const [selectedRemoveTruck, setSelectedRemoveTruck] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [creatingDestination, setCreatingDestination] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()
  const frontNumberSelectId = useId()
  const haulerSelectId = useId()
  const referenceSelectId = useId()
  const baseTruckSelectId = useId()
  const addTruckSelectId = useId()
  const removeTruckSelectId = useId()
  const frontErrorId = useId()
  const haulerErrorId = useId()
  const referenceErrorId = useId()
  const destinationErrorId = useId()
  const globalErrorId = useId()

  const existingIndex = useMemo(
    () => entries.findIndex((entry) => entry.fleetId === initialEntry.fleetId),
    [entries, initialEntry.fleetId],
  )
  const referenceOptions = existingIndex < 0 ? entries : entries.slice(0, existingIndex)

  /**
   * Front numbers already used by another draft entry are hidden from the
   * selector (Phase 18 §1) — the operator can never pick a number that
   * would only fail later at DUPLICATE_FRONT_ID submit-time validation
   * (`fleet-setup.ts`, kept as defense-in-depth). The entry currently
   * being edited keeps its own number visible so re-saving without
   * changing it still works.
   */
  const usedFrontNumbers = useMemo(
    () =>
      new Set(
        entries
          .filter((entry) => entry.fleetId !== draft.fleetId && entry.frontNumber)
          .map((entry) => entry.frontNumber),
      ),
    [entries, draft.fleetId],
  )
  const availableFrontNumberOptions = FRONT_NUMBER_OPTIONS.filter(
    (frontNumber) => frontNumber === draft.frontNumber || !usedFrontNumbers.has(frontNumber),
  )

  const candidateEntries = useMemo(
    () =>
      existingIndex < 0
        ? [...entries, draft]
        : entries.map((entry, index) => (index === existingIndex ? draft : entry)),
    [draft, entries, existingIndex],
  )

  const inheritedTruckIds = useMemo(() => {
    if (draft.kind !== 'DERIVED' || !draft.referenceFleetId) return []
    const result = previewEffectiveFleet(entries, shift, masterData, draft.referenceFleetId)
    return result.ok ? result.value : []
  }, [draft.kind, draft.referenceFleetId, entries, masterData, shift])

  const preview = useMemo(
    () => previewEffectiveFleet(candidateEntries, shift, masterData, draft.fleetId),
    [candidateEntries, draft.fleetId, masterData, shift],
  )
  const baseOptions = truckOptionsForHauler(masterData, draft.haulerCode).filter(
    (id) => !draft.truckIds.includes(id),
  )
  const addOptions = availableAddedTruckIds(
    masterData,
    draft.haulerCode,
    inheritedTruckIds,
    draft.addedTruckIds,
    draft.removedTruckIds,
  )
  const removeOptions = inheritedTruckIds.filter(
    (id) => !draft.addedTruckIds.includes(id) && !draft.removedTruckIds.includes(id),
  )

  const destinationCandidates: readonly SearchableComboboxOption[] = useMemo(() => {
    const normalized = destinationQuery.trim().toLowerCase()
    if (!normalized) return []
    return masterData.pileAreas
      .filter(
        (pileArea) =>
          pileArea.sectorCode === shift.sectorCode &&
          ((pileArea.pileId as string).toLowerCase().includes(normalized) ||
            (pileArea.stockpileCode as string).toLowerCase().includes(normalized)),
      )
      .map((pileArea) => ({
        value: pileArea.pileId as string,
        label: pileArea.pileId as string,
        description: `${pileArea.oreCode} · ${pileArea.stockpileCode}`,
      }))
  }, [destinationQuery, masterData.pileAreas, shift.sectorCode])

  const selectedDestination = draft.destinationPileId
    ? masterData.pileAreas.find((pileArea) => pileArea.pileId === draft.destinationPileId)
    : undefined

  function update(patch: Partial<FleetSetupDraftEntry>) {
    setDraft((current) => ({ ...current, ...patch }))
    setErrorCode(undefined)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = createFleetSetupFromDraft(candidateEntries, shift, masterData)
    if (!result.ok) {
      setErrorCode(result.error.code)
      return
    }
    onSave(cloneFleetSetupDraftEntry(draft))
  }

  const currentErrorTarget = errorTarget(errorCode)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(existingIndex < 0 ? 'fleetSetup.addFront' : 'fleetSetup.editFront')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={frontNumberSelectId} className="text-sm font-medium">
              {t('fleetSetup.frontNumber')}
            </label>
            <select
              id={frontNumberSelectId}
              value={draft.frontNumber}
              onChange={(event) => update({ frontNumber: event.target.value })}
              aria-invalid={currentErrorTarget === 'frontNumber' ? true : undefined}
              aria-describedby={currentErrorTarget === 'frontNumber' ? frontErrorId : undefined}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">—</option>
              {availableFrontNumberOptions.map((frontNumber) => (
                <option key={frontNumber} value={frontNumber}>
                  {frontNumber}
                </option>
              ))}
            </select>
            <FieldError
              id={frontErrorId}
              errorCode={currentErrorTarget === 'frontNumber' ? errorCode : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('fleetSetup.sector')}</span>
            <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
              {shift.sectorCode}
            </output>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('fleetSetup.frontId')}</span>
            <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
              {draft.frontNumber ? formatFrontId(shift.sectorCode, draft.frontNumber) : '—'}
            </output>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={haulerSelectId} className="text-sm font-medium">
              {t('fleetSetup.hauler')}
            </label>
            <select
              id={haulerSelectId}
              value={draft.haulerCode}
              onChange={(event) => {
                setSelectedBaseTruck('')
                setSelectedAddTruck('')
                setSelectedRemoveTruck('')
                update({
                  haulerCode: event.target.value,
                  truckIds: [],
                  addedTruckIds: [],
                  removedTruckIds: [],
                })
              }}
              aria-invalid={currentErrorTarget === 'hauler' ? true : undefined}
              aria-describedby={currentErrorTarget === 'hauler' ? haulerErrorId : undefined}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">—</option>
              {masterData.haulers.map((hauler) => (
                <option key={hauler.code} value={hauler.code}>
                  {hauler.code}
                </option>
              ))}
            </select>
            <FieldError
              id={haulerErrorId}
              errorCode={currentErrorTarget === 'hauler' ? errorCode : undefined}
            />
          </div>

          {creatingDestination ? (
            <NewPileForm
              initialPileId={destinationQuery.trim()}
              sectorCode={shift.sectorCode}
              masterData={masterData}
              onSubmit={(newPileDraft) => {
                if (!createNewPile) {
                  return Promise.resolve({
                    ok: false as const,
                    error: {
                      code: 'PILE_MASTER_CREATION_UNAVAILABLE',
                      message: 'New Pile Master creation is not available here',
                    },
                  })
                }
                return createNewPile(newPileDraft)
              }}
              onCreated={(created) => {
                onMasterDataUpdated?.(created.masterData)
                update({ destinationPileId: created.pileArea.pileId })
                setCreatingDestination(false)
                setDestinationQuery('')
              }}
              onCancel={() => setCreatingDestination(false)}
            />
          ) : (
            <>
              <SearchableCombobox
                label={t('fleetSetup.destinationPile')}
                query={destinationQuery}
                onQueryChange={setDestinationQuery}
                options={destinationCandidates}
                onSelect={(option) => {
                  update({ destinationPileId: option.value })
                  setDestinationQuery('')
                }}
                selectedLabel={
                  draft.destinationPileId
                    ? `${draft.destinationPileId}${selectedDestination ? ` (${selectedDestination.oreCode} · ${selectedDestination.stockpileCode})` : ''}`
                    : undefined
                }
                clearLabel={t('fleetSetup.change')}
                onClearSelection={() => update({ destinationPileId: '' })}
                placeholder={t('fleetSetup.destinationPilePlaceholder')}
                noResultsContent={
                  createNewPile && destinationQuery.trim() ? (
                    <Button type="button" variant="secondary" onClick={() => setCreatingDestination(true)}>
                      {t('pileMaster.addNewPileNamed', { pileId: destinationQuery.trim() })}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('fleetSetup.destinationPileNotFound')}</p>
                  )
                }
              />
              <FieldError
                id={destinationErrorId}
                errorCode={currentErrorTarget === 'destination' ? errorCode : undefined}
              />
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={referenceSelectId} className="text-sm font-medium">
              {t('fleetSetup.referenceFleet')}
            </label>
            <select
              id={referenceSelectId}
              value={draft.kind === 'DERIVED' ? draft.referenceFleetId : ''}
              onChange={(event) => {
                const value = event.target.value
                setSelectedBaseTruck('')
                setSelectedAddTruck('')
                setSelectedRemoveTruck('')
                update(
                  value === ''
                    ? { kind: 'BASE', referenceFleetId: '', truckIds: [], addedTruckIds: [], removedTruckIds: [] }
                    : {
                        kind: 'DERIVED',
                        referenceFleetId: value,
                        truckIds: [],
                        addedTruckIds: [],
                        removedTruckIds: [],
                      },
                )
              }}
              aria-invalid={currentErrorTarget === 'reference' ? true : undefined}
              aria-describedby={currentErrorTarget === 'reference' ? referenceErrorId : undefined}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">{t('fleetSetup.noReference')}</option>
              {referenceOptions
                .filter((entry) => entry.frontNumber)
                .map((entry) => (
                  <option key={entry.fleetId} value={entry.fleetId}>
                    {t('fleetSetup.frontReference', {
                      frontId: formatFrontId(shift.sectorCode, entry.frontNumber),
                    })}
                  </option>
                ))}
            </select>
            <FieldError
              id={referenceErrorId}
              errorCode={currentErrorTarget === 'reference' ? errorCode : undefined}
            />
          </div>

          {draft.kind === 'BASE' ? (
            <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <h4 className="font-semibold">{t('fleetSetup.allowedTrucks')}</h4>
              <TruckAction
                id={baseTruckSelectId}
                label={t('fleetSetup.addTruck')}
                actionLabel={t('fleetSetup.addTruck')}
                options={baseOptions}
                value={selectedBaseTruck}
                onValueChange={setSelectedBaseTruck}
                onAction={(truckId) => {
                  if (!baseOptions.includes(truckId)) return
                  update({ truckIds: [...draft.truckIds, truckId] })
                  setSelectedBaseTruck('')
                }}
              />
              <SelectedTrucks
                truckIds={draft.truckIds}
                actionLabel={(id) => t('fleetSetup.removeTruckNamed', { truckId: id })}
                onRemove={(id) =>
                  update({ truckIds: draft.truckIds.filter((truckId) => truckId !== id) })
                }
              />
            </section>
          ) : (
            <>
              <EffectiveFleetPreview
                truckIds={inheritedTruckIds}
                titleKey="fleetSetup.inheritedTrucks"
              />
              <section className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <h4 className="font-semibold text-emerald-950">{t('fleetSetup.addedTrucks')}</h4>
                <TruckAction
                  id={addTruckSelectId}
                  label={t('fleetSetup.addTruck')}
                  actionLabel={t('fleetSetup.addTruck')}
                  options={addOptions}
                  value={selectedAddTruck}
                  onValueChange={setSelectedAddTruck}
                  onAction={(truckId) => {
                    if (!addOptions.includes(truckId)) return
                    update({ addedTruckIds: [...draft.addedTruckIds, truckId] })
                    setSelectedAddTruck('')
                  }}
                />
                <SelectedTrucks
                  truckIds={draft.addedTruckIds}
                  actionLabel={(id) => t('fleetSetup.removeAddedTruckNamed', { truckId: id })}
                  onRemove={(id) =>
                    update({
                      addedTruckIds: draft.addedTruckIds.filter((truckId) => truckId !== id),
                    })
                  }
                />
              </section>
              <section className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <h4 className="font-semibold text-amber-950">{t('fleetSetup.removedTrucks')}</h4>
                <TruckAction
                  id={removeTruckSelectId}
                  label={t('fleetSetup.removeTruck')}
                  actionLabel={t('fleetSetup.removeTruck')}
                  options={removeOptions}
                  value={selectedRemoveTruck}
                  onValueChange={setSelectedRemoveTruck}
                  onAction={(truckId) => {
                    if (!removeOptions.includes(truckId)) return
                    update({ removedTruckIds: [...draft.removedTruckIds, truckId] })
                    setSelectedRemoveTruck('')
                  }}
                />
                <SelectedTrucks
                  truckIds={draft.removedTruckIds}
                  actionLabel={(id) => t('fleetSetup.restoreRemovedTruckNamed', { truckId: id })}
                  onRemove={(id) =>
                    update({
                      removedTruckIds: draft.removedTruckIds.filter((truckId) => truckId !== id),
                    })
                  }
                />
              </section>
            </>
          )}

          <EffectiveFleetPreview
            truckIds={preview.ok ? preview.value : []}
            errorKey={preview.ok ? undefined : fleetErrorTranslationKey(preview.error.code)}
          />
          <FieldError
            id={globalErrorId}
            errorCode={currentErrorTarget === 'global' ? errorCode : undefined}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('fleetSetup.cancel')}
            </Button>
            <Button type="submit">{t('fleetSetup.saveFront')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
