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
  type FleetSetupDraftEntry,
} from '@/application/fleet-setup/fleet-setup-draft'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { EffectiveFleetPreview } from '@/features/fleet-setup/effective-fleet-preview'
import { fleetErrorTranslationKey } from '@/features/fleet-setup/error-messages'

interface FrontEditorProps {
  initialEntry: FleetSetupDraftEntry
  entries: readonly FleetSetupDraftEntry[]
  shift: Shift
  masterData: MasterData
  onSave: (entry: FleetSetupDraftEntry) => void
  onCancel: () => void
}

type ErrorTarget = 'frontId' | 'hauler' | 'reference' | 'global'

const ERROR_TARGETS: Readonly<Record<string, ErrorTarget>> = {
  BLANK_FRONT_ID: 'frontId',
  DUPLICATE_FRONT_ID: 'frontId',
  BLANK_HAULER_CODE: 'hauler',
  FRONT_HAULER_NOT_FOUND: 'hauler',
  FLEET_REFERENCE_REQUIRED: 'reference',
  FLEET_REFERENCE_NOT_FOUND: 'reference',
}

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

function TruckAction({
  id,
  label,
  actionLabel,
  options,
  value,
  onValueChange,
  onAction,
}: {
  id: string
  label: string
  actionLabel: string
  options: readonly string[]
  value: string
  onValueChange: (value: string) => void
  onAction: (value: string) => void
}) {
  const actionEnabled = value.length > 0 && options.includes(value)

  function handleAction() {
    if (!actionEnabled) return
    onAction(value)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-11 min-w-0 rounded-md border border-border bg-background px-3 text-base"
        >
          <option value="">—</option>
          {options.map((truckId) => (
            <option key={truckId} value={truckId}>
              {truckId}
            </option>
          ))}
        </select>
        <Button type="button" onClick={handleAction} disabled={!actionEnabled}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

function SelectedTrucks({
  truckIds,
  actionLabel,
  onRemove,
}: {
  truckIds: readonly string[]
  actionLabel: (truckId: string) => string
  onRemove: (truckId: string) => void
}) {
  const { t } = useTranslation()
  if (truckIds.length === 0)
    return <p className="text-sm text-muted-foreground">{t('fleetSetup.noTrucks')}</p>
  return (
    <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
      {truckIds.map((truckId) => (
        <li
          key={truckId}
          className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background px-3 py-2"
        >
          <span className="min-w-0 break-all font-medium">{truckId}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onRemove(truckId)}
            aria-label={actionLabel(truckId)}
          >
            {t('fleetSetup.remove')}
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function FrontEditor({
  initialEntry,
  entries,
  shift,
  masterData,
  onSave,
  onCancel,
}: FrontEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => cloneFleetSetupDraftEntry(initialEntry))
  const [selectedBaseTruck, setSelectedBaseTruck] = useState('')
  const [selectedAddTruck, setSelectedAddTruck] = useState('')
  const [selectedRemoveTruck, setSelectedRemoveTruck] = useState('')
  const [errorCode, setErrorCode] = useState<string>()
  const frontIdInputId = useId()
  const haulerSelectId = useId()
  const fleetTypeSelectId = useId()
  const referenceSelectId = useId()
  const baseTruckSelectId = useId()
  const addTruckSelectId = useId()
  const removeTruckSelectId = useId()
  const frontErrorId = useId()
  const haulerErrorId = useId()
  const referenceErrorId = useId()
  const globalErrorId = useId()

  const existingIndex = entries.findIndex((entry) => entry.fleetId === initialEntry.fleetId)
  const referenceOptions = existingIndex < 0 ? entries : entries.slice(0, existingIndex)
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
            <label htmlFor={frontIdInputId} className="text-sm font-medium">
              {t('fleetSetup.frontId')}
            </label>
            <input
              id={frontIdInputId}
              value={draft.frontId}
              onChange={(event) => update({ frontId: event.target.value })}
              aria-invalid={currentErrorTarget === 'frontId' ? true : undefined}
              aria-describedby={currentErrorTarget === 'frontId' ? frontErrorId : undefined}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            />
            <FieldError
              id={frontErrorId}
              errorCode={currentErrorTarget === 'frontId' ? errorCode : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('fleetSetup.sector')}</span>
            <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
              {shift.sectorCode}
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fleetTypeSelectId} className="text-sm font-medium">
              {t('fleetSetup.fleetType')}
            </label>
            <select
              id={fleetTypeSelectId}
              value={draft.kind}
              onChange={(event) => {
                setSelectedBaseTruck('')
                setSelectedAddTruck('')
                setSelectedRemoveTruck('')
                update({
                  kind: event.target.value as 'BASE' | 'DERIVED',
                  referenceFleetId: '',
                  truckIds: [],
                  addedTruckIds: [],
                  removedTruckIds: [],
                })
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="BASE">{t('fleetSetup.directFleet')}</option>
              <option value="DERIVED">{t('fleetSetup.referencedFleet')}</option>
            </select>
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
              <div className="flex flex-col gap-1.5">
                <label htmlFor={referenceSelectId} className="text-sm font-medium">
                  {t('fleetSetup.referenceFleet')}
                </label>
                <select
                  id={referenceSelectId}
                  value={draft.referenceFleetId}
                  onChange={(event) => {
                    setSelectedAddTruck('')
                    setSelectedRemoveTruck('')
                    update({
                      referenceFleetId: event.target.value,
                      addedTruckIds: [],
                      removedTruckIds: [],
                    })
                  }}
                  aria-invalid={currentErrorTarget === 'reference' ? true : undefined}
                  aria-describedby={
                    currentErrorTarget === 'reference' ? referenceErrorId : undefined
                  }
                  className="h-11 rounded-md border border-border bg-background px-3 text-base"
                >
                  <option value="">—</option>
                  {referenceOptions.map((entry) => (
                    <option key={entry.fleetId} value={entry.fleetId}>
                      {t('fleetSetup.frontReference', { frontId: entry.frontId })}
                    </option>
                  ))}
                </select>
                <FieldError
                  id={referenceErrorId}
                  errorCode={currentErrorTarget === 'reference' ? errorCode : undefined}
                />
              </div>
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
