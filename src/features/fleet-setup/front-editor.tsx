import { useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { buildExcaCode, excaNumberFromCode } from '@/domain/fleet/exca-code'
import { previewEffectiveFleet, truckOptionsForHauler } from '@/application/fleet-setup/effective-fleet-preview'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { cloneFleetSetupDraftEntry, formatFrontId, type FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { Button } from '@/components/ui/button'
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/shared/SearchableCombobox'
import type { PileId } from '@/domain/common/identifiers'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { fleetErrorTranslationKey } from '@/features/fleet-setup/error-messages'
import { SearchableTruckPicker } from '@/features/fleet-setup/searchable-truck-picker'

interface FrontEditorProps {
  initialEntry: FleetSetupDraftEntry
  entries: readonly FleetSetupDraftEntry[]
  shift: Shift
  masterData: MasterData
  onSave: (entry: FleetSetupDraftEntry) => void
  onCancel: () => void
  eligibleDestinationPileIds?: readonly PileId[]
}

const FRONT_NUMBER_OPTIONS = Array.from({ length: 25 }, (_, index) => String(index + 1).padStart(2, '0'))

export function FrontEditor({ initialEntry, entries, shift, masterData, onSave, onCancel, eligibleDestinationPileIds }: FrontEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => cloneFleetSetupDraftEntry(initialEntry))
  const [destinationQuery, setDestinationQuery] = useState('')
  const [frontQuery, setFrontQuery] = useState('')
  const [truckQuery, setTruckQuery] = useState('')
  const [excaNumber, setExcaNumber] = useState(() => excaNumberFromCode(initialEntry.excaCode))
  const [errorKey, setErrorKey] = useState<string>()
  const frontId = useId()
  const companyId = useId()
  const referenceId = useId()
  const excaId = useId()
  const existingIndex = entries.findIndex((entry) => entry.fleetId === initialEntry.fleetId)
  const referenceOptions = existingIndex < 0 ? entries : entries.slice(0, existingIndex)
  const usedFrontNumbers = new Set(entries.filter((entry) => entry.fleetId !== draft.fleetId).map((entry) => entry.frontNumber))
  const frontCandidates = useMemo(() => {
    const query = frontQuery.trim().toLowerCase()
    return FRONT_NUMBER_OPTIONS.filter((number) => number === draft.frontNumber || !usedFrontNumbers.has(number))
      .filter((number) => !query || number.includes(query) || formatFrontId(shift.sectorCode, number).toLowerCase().includes(query))
  }, [draft.frontNumber, frontQuery, shift.sectorCode, usedFrontNumbers])

  const destinationCandidates: readonly SearchableComboboxOption[] = useMemo(() => {
    const query = destinationQuery.trim().toLowerCase()
    if (!query) return []
    return masterData.pileAreas
      .filter((pileArea) => pileArea.sectorCode === shift.sectorCode && (eligibleDestinationPileIds === undefined || eligibleDestinationPileIds.includes(pileArea.pileId)) && ((pileArea.pileId as string).toLowerCase().includes(query) || (pileArea.stockpileCode as string).toLowerCase().includes(query)))
      .map((pileArea) => ({ value: pileArea.pileId as string, label: pileArea.pileId as string, description: `${pileArea.oreCode} · ${pileArea.stockpileCode}` }))
  }, [destinationQuery, eligibleDestinationPileIds, masterData.pileAreas, shift.sectorCode])

  const selectedDestination = draft.destinationPileId ? masterData.pileAreas.find((pileArea) => pileArea.pileId === draft.destinationPileId) : undefined
  const candidateEntries = existingIndex < 0 ? [...entries, draft] : entries.map((entry, index) => index === existingIndex ? draft : entry)
  const inheritedTruckIds = useMemo(() => {
    if (draft.kind !== 'DERIVED' || !draft.referenceFleetId) return []
    const preview = previewEffectiveFleet(entries, shift, masterData, draft.referenceFleetId)
    return preview.ok ? preview.value : []
  }, [draft.kind, draft.referenceFleetId, entries, masterData, shift])
  const effectivePreview = useMemo(() => previewEffectiveFleet(candidateEntries, shift, masterData, draft.fleetId), [candidateEntries, draft.fleetId, masterData, shift])
  const operatingTrucks = effectivePreview.ok ? effectivePreview.value : draft.kind === 'BASE' ? draft.truckIds : [...inheritedTruckIds, ...draft.addedTruckIds]
  const sortedOperatingTrucks = useMemo(
    () => [...operatingTrucks].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })),
    [operatingTrucks],
  )
  const truckOptions = useMemo(() => {
    const allCompanyTrucks = truckOptionsForHauler(masterData, draft.haulerCode)
    const effective = new Set(operatingTrucks)
    return allCompanyTrucks.filter((truckId) => !effective.has(truckId) || draft.removedTruckIds.includes(truckId))
  }, [draft.haulerCode, draft.removedTruckIds, masterData, operatingTrucks])

  function update(patch: Partial<FleetSetupDraftEntry>) {
    setDraft((current) => ({ ...current, ...patch }))
    setErrorKey(undefined)
  }

  function addTruck(truckId: string) {
    if (!truckOptions.includes(truckId)) return
    if (draft.kind === 'BASE') update({ truckIds: [...draft.truckIds, truckId] })
    else if (draft.removedTruckIds.includes(truckId)) update({ removedTruckIds: draft.removedTruckIds.filter((id) => id !== truckId) })
    else update({ addedTruckIds: [...draft.addedTruckIds, truckId] })
    setTruckQuery('')
  }

  function removeTruck(truckId: string) {
    if (draft.kind === 'BASE') update({ truckIds: draft.truckIds.filter((id) => id !== truckId) })
    else if (draft.addedTruckIds.includes(truckId)) update({ addedTruckIds: draft.addedTruckIds.filter((id) => id !== truckId) })
    else if (inheritedTruckIds.includes(truckId)) update({ removedTruckIds: [...draft.removedTruckIds, truckId] })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.destinationPileId) {
      setErrorKey('fleetSetup.errors.destinationRequired')
      return
    }
    const exca = buildExcaCode(draft.haulerCode, excaNumber)
    if (!exca.ok) {
      setErrorKey(fleetErrorTranslationKey(exca.error.code))
      return
    }
    const saved = { ...draft, excaCode: exca.value }
    const allEntries = existingIndex < 0 ? [...entries, saved] : entries.map((entry, index) => index === existingIndex ? saved : entry)
    const validation = createFleetSetupFromDraft(allEntries, shift, masterData)
    if (!validation.ok) {
      setErrorKey(fleetErrorTranslationKey(validation.error.code))
      return
    }
    onSave(saved)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-labelledby="add-fleet-title">
      <form onSubmit={handleSubmit} noValidate className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background p-3 shadow-xl">
        <h2 id="add-fleet-title" className="shrink-0 text-center text-lg font-semibold">{t('fleetSetup.addFleetTitle')}</h2>
        <section className="mt-2 flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h3 className="text-sm font-medium">{t('fleetSetup.operatingTruckUnits')}</h3>
            <span className="text-sm font-bold text-emerald-700">{sortedOperatingTrucks.length} {sortedOperatingTrucks.length === 1 ? 'Truck' : 'Trucks'}</span>
          </div>
          <ul className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            {sortedOperatingTrucks.map((truckId) => <li key={truckId} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" className="font-semibold text-red-600" aria-label={`Remove ${truckId}`} onClick={() => removeTruck(truckId)}>x</button></li>)}
            {sortedOperatingTrucks.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No Trucks</li> : null}
          </ul>
        </section>
        <div className="mt-2 shrink-0 space-y-2">
          <div className="relative">
            <label htmlFor={frontId} className="sr-only">{t('fleetSetup.frontCode')}</label>
            {draft.frontNumber ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 text-sm">
                <span className="min-w-0 truncate font-medium">{formatFrontId(shift.sectorCode, draft.frontNumber)}</span>
                <button type="button" className="text-primary" onClick={() => { update({ frontNumber: '' }); setFrontQuery('') }}>Change</button>
              </div>
            ) : (
              <>
                <input id={frontId} value={frontQuery} onChange={(event) => setFrontQuery(event.target.value)} placeholder={t('fleetSetup.frontCode')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
                {frontQuery.trim() ? <div className="absolute bottom-full left-0 z-20 mb-1 max-h-36 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                  {frontCandidates.map((number) => <button key={number} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { update({ frontNumber: number }); setFrontQuery('') }}>{formatFrontId(shift.sectorCode, number)}</button>)}
                  {frontCandidates.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No Front found.</p> : null}
                </div> : null}
              </>
            )}
          </div>
          <div><label htmlFor={companyId} className="sr-only">{t('fleetSetup.company')}</label><select id={companyId} value={draft.haulerCode} onChange={(event) => { setTruckQuery(''); update({ haulerCode: event.target.value, truckIds: [], addedTruckIds: [], removedTruckIds: [] }) }} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">{t('fleetSetup.company')}</option>{masterData.haulers.map((hauler) => <option key={hauler.code} value={hauler.code}>{hauler.code}</option>)}</select></div>
          <SearchableCombobox label="Search Pile / Stockpile" hideLabel query={destinationQuery} onQueryChange={setDestinationQuery} options={destinationCandidates} onSelect={(option) => { update({ destinationPileId: option.value }); setDestinationQuery('') }} selectedLabel={draft.destinationPileId ? `${draft.destinationPileId}${selectedDestination ? ` (${selectedDestination.oreCode} · ${selectedDestination.stockpileCode})` : ''}` : undefined} clearLabel="Change" onClearSelection={() => update({ destinationPileId: '' })} placeholder="Search Pile / Stockpile..." noResultsContent={<p className="text-sm text-muted-foreground">No pile found.</p>} />
          <div><label htmlFor={referenceId} className="sr-only">Fleet Reference</label><select id={referenceId} value={draft.kind === 'DERIVED' ? draft.referenceFleetId : ''} onChange={(event) => { const value = event.target.value; update(value ? { kind: 'DERIVED', referenceFleetId: value, truckIds: [], addedTruckIds: [], removedTruckIds: [] } : { kind: 'BASE', referenceFleetId: '', truckIds: [], addedTruckIds: [], removedTruckIds: [] }) }} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">Fleet Reference</option>{referenceOptions.map((entry) => <option key={entry.fleetId} value={entry.fleetId}>{formatFrontId(shift.sectorCode, entry.frontNumber)}</option>)}</select></div>
          <div><label htmlFor={excaId} className="sr-only">{t('fleetSetup.excaNumber')}</label><input id={excaId} value={excaNumber} inputMode="numeric" onChange={(event) => { setExcaNumber(event.target.value); setErrorKey(undefined) }} placeholder={t('fleetSetup.excaNumber')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" /></div>
          <SearchableTruckPicker label="Search Unit Truck" hideLabel placeholder="Search Unit Truck..." noResultsLabel="No matching truck found." query={truckQuery} onQueryChange={setTruckQuery} truckIds={truckOptions} onSelect={addTruck} resultsAbove />
        </div>
        {errorKey ? <p role="alert" className="mt-2 shrink-0 text-sm text-red-700">{t(errorKey)}</p> : null}
        <div className="mt-2 grid shrink-0 grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={onCancel}>{t('fleetSetup.cancel')}</Button><Button type="submit">{t('fleetSetup.saveFleet')}</Button></div>
      </form>
    </div>
  )
}
