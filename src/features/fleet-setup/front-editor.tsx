import { useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { buildExcaCode, excaNumberFromCode } from '@/domain/fleet/exca-code'
import { eligiblePileIds, eligibleTruckIds, fleetNumberSuggestion } from '@/application/fleet-setup/fleet-editor-rules'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { formatFleetFullCode, formatFleetShortLabel } from '@/application/fleet-setup/fleet-assignment-identity'
import { cloneFleetSetupDraftEntry, type FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/custom-select'
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
  const [pendingFrontNumber, setPendingFrontNumber] = useState<string>()
  const [errorKey, setErrorKey] = useState<string>()
  const frontId = useId()
  const companyId = useId()
  const excaId = useId()
  const existingIndex = entries.findIndex((entry) => entry.fleetId === initialEntry.fleetId)
  const suggestedFrontNumber = useMemo(() => {
    const existingNumbers = entries
      .filter((entry) => entry.fleetId !== draft.fleetId)
      .map((entry) => Number(entry.frontNumber))
    const suggested = fleetNumberSuggestion(shift.sectorCode, existingNumbers).suggested
    return suggested.slice(suggested.lastIndexOf('/') + 1)
  }, [draft.fleetId, entries, shift.sectorCode])
  const availableFrontNumbers = useMemo(() => {
    const usedFrontNumbers = new Set(entries.filter((entry) => entry.fleetId !== draft.fleetId).map((entry) => entry.frontNumber))
    return FRONT_NUMBER_OPTIONS.filter((number) => number === draft.frontNumber || !usedFrontNumbers.has(number))
  }, [draft.fleetId, draft.frontNumber, entries])
  const frontCandidates = useMemo(() => {
    const query = frontQuery.trim().toLowerCase()
    return availableFrontNumbers
      .filter((number) => !query || number.includes(query) || formatFleetShortLabel(Number(number)).toLowerCase().includes(query))
  }, [availableFrontNumbers, frontQuery])
  const destinationCandidates: readonly SearchableComboboxOption[] = useMemo(() => {
    const query = destinationQuery.trim().toLowerCase()
    if (!query || !draft.haulerCode) return []
    const assignments = entries
      .filter((entry) => entry.fleetId !== draft.fleetId)
      .map((entry) => ({ company: entry.haulerCode, pileId: entry.destinationPileId || undefined, truckIds: entry.truckIds, active: true }))
    return eligiblePileIds(masterData.pileAreas, assignments, draft.haulerCode)
      .filter((pileArea) => {
        if (pileArea.sectorCode !== shift.sectorCode) return false
        if (eligibleDestinationPileIds !== undefined && !eligibleDestinationPileIds.includes(pileArea.pileId)) return false
        if (!(pileArea.pileId as string).toLowerCase().includes(query) && !(pileArea.stockpileCode as string).toLowerCase().includes(query)) return false
        return true
      })
      .map((pileArea) => ({ value: pileArea.pileId as string, label: pileArea.pileId as string, description: `${pileArea.oreCode} · ${pileArea.stockpileCode}` }))
  }, [destinationQuery, draft.fleetId, draft.haulerCode, eligibleDestinationPileIds, entries, masterData.pileAreas, shift.sectorCode])

  const selectedDestination = draft.destinationPileId ? masterData.pileAreas.find((pileArea) => pileArea.pileId === draft.destinationPileId) : undefined
  const operatingTrucks = draft.truckIds
  const sortedOperatingTrucks = useMemo(
    () => [...operatingTrucks].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })),
    [operatingTrucks],
  )
  const truckOptions = useMemo(() => {
    const allTrucks = masterData.trucks.map((truck) => ({ truckId: truck.id as string, company: truck.haulerCode as string }))
    return eligibleTruckIds(allTrucks, draft.haulerCode, operatingTrucks).map((truck) => truck.truckId)
  }, [draft.haulerCode, masterData.trucks, operatingTrucks])
  const hasValidExca = buildExcaCode(draft.haulerCode, excaNumber).ok

  function update(patch: Partial<FleetSetupDraftEntry>) {
    setDraft((current) => ({ ...current, ...patch }))
    setErrorKey(undefined)
  }

  function resetTrucks(patch: Partial<FleetSetupDraftEntry> = {}) {
    setTruckQuery('')
    update({ ...patch, truckIds: [], addedTruckIds: [], removedTruckIds: [] })
  }

  function selectDestinationPile(destinationPileId: string) {
    setDestinationQuery('')
    setExcaNumber('')
    resetTrucks({ destinationPileId, excaCode: '' })
  }

  function applyFrontNumber(frontNumber: string) {
    setFrontQuery('')
    update({ frontNumber })
  }

  function requestFrontNumber(frontNumber: string) {
    const isUnchangedEdit = frontNumber === initialEntry.frontNumber
    const smallestAvailable = availableFrontNumbers[0]
    if (!isUnchangedEdit && smallestAvailable !== undefined && frontNumber !== smallestAvailable) {
      setPendingFrontNumber(frontNumber)
      return
    }
    applyFrontNumber(frontNumber)
  }

  function addTruck(truckId: string) {
    if (!truckOptions.includes(truckId)) return
    update({ truckIds: [...draft.truckIds, truckId] })
    setTruckQuery('')
  }

  function removeTruck(truckId: string) {
    update({ truckIds: draft.truckIds.filter((id) => id !== truckId) })
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
        <h2 id="add-fleet-title" className="type-dialog-title shrink-0 text-center">{existingIndex < 0 ? t('fleetSetup.addFleetTitle') : t('fleetSetup.editFleet')}</h2>
        <div className="mt-2 shrink-0 space-y-2">
          <div><label htmlFor={companyId} className="sr-only">{t('fleetSetup.company')}</label><CustomSelect id={companyId} ariaLabel={t('fleetSetup.company')} value={draft.haulerCode} onChange={(haulerCode) => { setTruckQuery(''); setDestinationQuery(''); setFrontQuery(''); setExcaNumber(''); update({ haulerCode, frontNumber: suggestedFrontNumber, excaCode: '', destinationPileId: '', truckIds: [], addedTruckIds: [], removedTruckIds: [] }) }} placeholder={t('fleetSetup.company')} options={masterData.haulers.map((hauler) => ({ value: hauler.code as string, label: hauler.code as string }))} className="h-10 text-sm" /></div>
          {draft.kind === 'DERIVED' ? <>
          <SearchableCombobox label="Pile ID" hideLabel disabled={!draft.haulerCode} query={destinationQuery} onQueryChange={setDestinationQuery} options={destinationCandidates} onSelect={(option) => selectDestinationPile(option.value)} selectedLabel={draft.destinationPileId ? `${draft.destinationPileId}${selectedDestination ? ` (${selectedDestination.oreCode} · ${selectedDestination.stockpileCode})` : ''}` : undefined} clearLabel="Change" onClearSelection={() => selectDestinationPile('')} placeholder="Search Pile_ID / Stockpile..." noResultsContent={<p className="text-sm text-muted-foreground">No eligible Pile found.</p>} />
          </> : null}
          <div className="relative">
            {draft.frontNumber ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 text-sm" aria-label="Suggested Fleet ID">
                <span className="min-w-0 truncate font-medium">{formatFleetShortLabel(Number(draft.frontNumber))}</span>
                <button type="button" aria-label="Change Fleet sequence" className="text-primary" onClick={() => { setFrontQuery(''); update({ frontNumber: '' }) }}>Change</button>
              </div>
            ) : (
              <>
                <label htmlFor={frontId} className="sr-only">Fleet sequence</label>
                <input id={frontId} disabled={!draft.haulerCode} inputMode="numeric" pattern="[0-9]*" value={frontQuery} onChange={(event) => setFrontQuery(event.target.value.replace(/\D/g, ''))} placeholder="Fleet sequence" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" />
                {frontQuery.trim() ? <div className="absolute bottom-full left-0 z-20 mb-1 max-h-36 w-full overflow-y-auto rounded-md border border-border bg-background text-foreground shadow-lg">
                  {frontCandidates.map((number) => <button key={number} type="button" className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none" onClick={() => requestFrontNumber(number)}>{formatFleetShortLabel(Number(number))}</button>)}
                  {frontCandidates.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No Fleet sequence found.</p> : null}
                </div> : null}
              </>
            )}
          </div>
          {draft.frontNumber ? <p className="text-xs text-muted-foreground">Permanent Fleet ID preview: {formatFleetFullCode({ operationalDate: shift.date, shiftCode: shift.shiftCode, sectorCode: shift.sectorCode, sequence: Number(draft.frontNumber) })}</p> : null}
          <SearchableCombobox label="Pile ID" hideLabel disabled={!draft.frontNumber} query={destinationQuery} onQueryChange={setDestinationQuery} options={destinationCandidates} onSelect={(option) => selectDestinationPile(option.value)} selectedLabel={draft.destinationPileId || undefined} clearLabel="Change" onClearSelection={() => selectDestinationPile('')} placeholder="Search Pile_ID / Stockpile..." noResultsContent={<p className="text-sm text-muted-foreground">No eligible Pile found.</p>} />
          <div><label htmlFor={excaId} className="sr-only">{t('fleetSetup.excaNumber')}</label><input id={excaId} disabled={!draft.frontNumber} value={excaNumber} inputMode="numeric" onChange={(event) => { setExcaNumber(event.target.value); resetTrucks({ excaCode: '' }) }} placeholder={t('fleetSetup.excaNumber')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" /></div>
        </div>
        <section className="mt-2 flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h3 className="type-subsection-title">{t('fleetSetup.operatingTruckUnits')}</h3>
            <span className="text-sm font-bold text-emerald-700">{sortedOperatingTrucks.length} {sortedOperatingTrucks.length === 1 ? 'Truck' : 'Trucks'}</span>
          </div>
          <ul className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            {sortedOperatingTrucks.map((truckId) => <li key={truckId} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" className="font-semibold text-red-600" aria-label={`Remove ${truckId}`} onClick={() => removeTruck(truckId)}>x</button></li>)}
            {sortedOperatingTrucks.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No Trucks</li> : null}
          </ul>
        </section>
        <div className="mt-2 shrink-0"><SearchableTruckPicker label="Truck" hideLabel disabled={!hasValidExca} placeholder="Search Unit Truck..." noResultsLabel="No matching truck found." query={truckQuery} onQueryChange={setTruckQuery} truckIds={truckOptions} onSelect={addTruck} resultsAbove /></div>
        {errorKey ? <p role="alert" className="mt-2 shrink-0 text-sm text-red-700">{t(errorKey)}</p> : null}
        <div className="mt-2 grid shrink-0 grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={onCancel}>{t('fleetSetup.cancel')}</Button><Button type="submit">{t('fleetSetup.saveFleet')}</Button></div>
      </form>
      {pendingFrontNumber ? <div role="dialog" aria-modal="true" aria-label="Confirm Fleet sequence" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3"><section className="w-full max-w-sm rounded-xl bg-background p-4 shadow-xl"><h3 className="type-dialog-title">Confirm Fleet sequence</h3><p className="mt-2 text-sm text-muted-foreground">A smaller unused Fleet sequence is available. Continue with {formatFleetShortLabel(Number(pendingFrontNumber))}?</p><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => { setFrontQuery(''); setPendingFrontNumber(undefined) }}>Cancel</Button><Button type="button" onClick={() => { applyFrontNumber(pendingFrontNumber); setPendingFrontNumber(undefined) }}>Continue</Button></div></section></div> : null}
    </div>
  )
}
