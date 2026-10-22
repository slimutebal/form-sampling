import { ArrowLeft, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { appendFrontContinuation } from '@/application/fleet-setup/append-front-continuation'
import { appendNewBaseFront } from '@/application/fleet-setup/append-new-base-front'
import { eligiblePileIds, fleetNumberSuggestion } from '@/application/fleet-setup/fleet-editor-rules'
import { generateFleetId } from '@/application/fleet-setup/fleet-id-generator'
import { operationalFleetOptionsForDestinationPile } from '@/application/haulage-operation/operational-fleet-options'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/custom-select'
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/shared/SearchableCombobox'
import { parseFleetId, type PileId } from '@/domain/common/identifiers'
import { buildExcaCode, displayExcaCode, excaNumberFromCode } from '@/domain/fleet/exca-code'
import { createFrontId, destinationPileIdsForFront, frontNumberFromFrontId } from '@/domain/fleet/front'
import { createFleetAssignmentIdentity } from '@/domain/fleet/fleet-assignment-identity'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import { createPile } from '@/domain/pile/pile'
import { parseHaulerCode } from '@/domain/master/master-codes'

interface ActiveFleetAddSheetProps { readonly onClose: () => void }
type FleetTab = 'active' | 'new'
type FleetDraft = Readonly<{ frontNumber: string; excaNumber: string; selectedTruckIds: readonly string[]; removedTruckIds: readonly string[]; addedTruckIds: readonly string[]; truckQuery: string }>
const emptyDraft = (frontNumber: string, selectedTruckIds: readonly string[] = [], excaNumber = ''): FleetDraft => ({ frontNumber, excaNumber, selectedTruckIds, removedTruckIds: [], addedTruckIds: [], truckQuery: '' })

/** Add Fleet is a local draft: commands and lifecycle records are untouched until Save succeeds. */
export function ActiveFleetAddSheet({ onClose }: ActiveFleetAddSheetProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ center: 350, maxHeight: 700 })
  const [fleetId] = useState(generateFleetId)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [company, setCompany] = useState('')
  // Initial registration deliberately chooses one destination. The domain keeps
  // destinationPileIds so a saved Fleet can later be extended from Edit Fleet.
  const [destinationPileId, setDestinationPileId] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [tab, setTab] = useState<FleetTab>('new')
  const [referenceFrontId, setReferenceFrontId] = useState<string>()
  const [excaTouched, setExcaTouched] = useState(false)
  const [fleetNumberTouched, setFleetNumberTouched] = useState(false)
  const [searchResultsOpen, setSearchResultsOpen] = useState(false)

  useEffect(() => {
    const syncViewport = () => {
      const visual = window.visualViewport
      const visibleHeight = visual?.height ?? window.innerHeight
      const visibleTop = visual?.offsetTop ?? 0
      setViewport({ center: visibleTop + visibleHeight / 2, maxHeight: Math.max(160, visibleHeight - 24) })
    }
    syncViewport()
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    return () => { window.visualViewport?.removeEventListener('resize', syncViewport); window.visualViewport?.removeEventListener('scroll', syncViewport) }
  }, [])

  const lineage = useMemo(() => deriveFrontLineage(workspace.fleetSetup), [workspace.fleetSetup])
  const activeFronts = useMemo(() => workspace.fleetSetup.fronts.filter((front) => lineage.activeFrontIds.includes(front.frontId)), [lineage.activeFrontIds, workspace.fleetSetup.fronts])
  const existingNumbers = useMemo(() => workspace.fleetSetup.fronts.filter((front) => front.sectorCode === workspace.shift.sectorCode).map((front) => frontNumberFromFrontId(front.frontId)), [workspace.fleetSetup.fronts, workspace.shift.sectorCode])
  const numberSuggestion = useMemo(() => fleetNumberSuggestion(workspace.shift.sectorCode, existingNumbers), [existingNumbers, workspace.shift.sectorCode])
  const suggestedNumber = numberSuggestion.suggested.split('/')[1] ?? ''
  const [activeDraft, setActiveDraft] = useState<FleetDraft>(() => emptyDraft(suggestedNumber))
  const [newDraft, setNewDraft] = useState<FleetDraft>(() => emptyDraft(suggestedNumber))
  const updateDraft = (update: (current: FleetDraft) => FleetDraft) => tab === 'active' ? setActiveDraft(update) : setNewDraft(update)
  const draft = tab === 'active' ? activeDraft : newDraft

  const activePileIds = useMemo(() => new Set(workspace.pileRegistrations.filter((registration) => registration.status === 'ACTIVE').map((registration) => registration.pileId)), [workspace.pileRegistrations])
  const destinationCandidates = useMemo<readonly SearchableComboboxOption[]>(() => {
    const query = destinationQuery.trim().toLowerCase()
    if (!company) return []
    // Lifecycle assignment establishes company ownership. Registration status is
    // the planned/active setup state; production and sampling remain unrelated.
    const assignments = activeFronts.flatMap((front) => destinationPileIdsForFront(front).map((pileId) => ({ company: front.haulerCode as string, pileId: pileId as string, truckIds: [], active: true })))
    return eligiblePileIds(workspace.masterData.pileAreas, assignments, company)
      .filter((pile) => pile.sectorCode === workspace.shift.sectorCode && activePileIds.has(pile.pileId))
      .filter((pile) => !query || String(pile.pileId).toLowerCase().includes(query) || String(pile.stockpileCode).toLowerCase().includes(query))
      .map((pile) => ({ value: pile.pileId as string, label: pile.pileId as string, material: pile.oreCode }))
  }, [activeFronts, activePileIds, company, destinationQuery, workspace.masterData.pileAreas, workspace.shift.sectorCode])
  const selectedDestination = useMemo(() => workspace.masterData.pileAreas.find((pile) => pile.pileId === destinationPileId), [destinationPileId, workspace.masterData.pileAreas])
  const referenceCandidates = useMemo(() => activeFronts.filter((front) => front.haulerCode === company).flatMap((front) => {
    const fleet = workspace.fleetSetup.fleets.find((candidate) => candidate.frontId === front.frontId)
    if (!fleet) return []
    const effective = resolveEffectiveFleetAgainstMaster(workspace.masterData, workspace.fleetSetup, fleet.fleetId)
    return effective.ok ? [{ front, fleet, truckIds: effective.value.truckIds.map(String) }] : []
  }), [activeFronts, company, workspace.fleetSetup, workspace.masterData])
  const reference = referenceCandidates.find((candidate) => candidate.front.frontId === referenceFrontId)
  const sourceReady = Boolean(company && destinationPileId)
  const activeEditorOpen = tab === 'active' && Boolean(reference)
  const editorOpen = tab === 'new' || activeEditorOpen
  const truckSearchCandidates = useMemo(() => workspace.masterData.trucks
    .filter((truck) => truck.haulerCode === company)
    .map((truck) => truck.id as string)
    .filter((truckId) => !draft.selectedTruckIds.includes(truckId) && !draft.removedTruckIds.includes(truckId))
    .filter((truckId) => truckId.toLowerCase().includes(draft.truckQuery.trim().toLowerCase()))
    .sort((left, right) => left.localeCompare(right)), [company, draft.removedTruckIds, draft.selectedTruckIds, draft.truckQuery, workspace.masterData.trucks])
  const selectedExca = useMemo(() => draft.excaNumber.trim() ? buildExcaCode(company, draft.excaNumber) : undefined, [company, draft.excaNumber])
  const fleetSequence = useMemo(() => /^\d+$/.test(draft.frontNumber) ? Number(draft.frontNumber) : undefined, [draft.frontNumber])
  const sequenceSuggestion = useMemo(() => fleetNumberSuggestion(workspace.shift.sectorCode, existingNumbers, fleetSequence), [existingNumbers, fleetSequence, workspace.shift.sectorCode])
  const sequenceValid = fleetSequence !== undefined && Number.isSafeInteger(fleetSequence) && fleetSequence > 0 && fleetSequence <= 25 && !sequenceSuggestion.duplicate
  const sequenceError = !draft.frontNumber
    ? fleetNumberTouched ? 'Required' : undefined
    : fleetSequence === undefined || !Number.isSafeInteger(fleetSequence) || fleetSequence < 1 || fleetSequence > 25 ? 'Enter 1–25'
      : sequenceSuggestion.duplicate ? 'Duplicate Number'
        : undefined
  const assignmentIdentity = useMemo(() => {
    if (!company || !sequenceValid || fleetSequence === undefined) return undefined
    const sequence = fleetSequence
    const assignmentId = parseFleetId(fleetId)
    const frontId = createFrontId(workspace.shift.sectorCode, sequence)
    const hauler = parseHaulerCode(company)
    if (!assignmentId.ok || !frontId.ok || !hauler.ok) return undefined
    const created = createFleetAssignmentIdentity({
      fleetAssignmentId: assignmentId.value,
      fleetSequence: sequence,
      originShiftId: workspace.shiftId,
      operationalDate: workspace.shift.date,
      shiftCode: workspace.shift.shiftCode,
      sectorCode: workspace.shift.sectorCode,
      frontId: frontId.value,
      company: hauler.value,
    })
    return created.ok ? created.value : undefined
  }, [company, fleetId, fleetSequence, sequenceValid, workspace.shift.date, workspace.shift.sectorCode, workspace.shift.shiftCode, workspace.shiftId])
  const fullFleetCode = assignmentIdentity?.fleetCode
  const excaValidationError = excaTouched
    ? !draft.excaNumber.trim() ? 'Required' : selectedExca && !selectedExca.ok ? selectedExca.error.code : undefined
    : undefined
  const candidate = useMemo(() => {
    if (!editorOpen || !assignmentIdentity || !sequenceValid || !draft.excaNumber.trim() || (selectedExca && !selectedExca.ok)) return undefined
    const excaCode = selectedExca && selectedExca.ok ? selectedExca.value : undefined
    return tab === 'active'
      ? appendFrontContinuation({ fleetSetup: workspace.fleetSetup, masterData: workspace.masterData, referenceFrontId: referenceFrontId ?? '', frontNumber: fleetSequence, destinationPileIds: [destinationPileId], excaCode, addedTruckIds: draft.selectedTruckIds.filter((truckId) => !reference?.truckIds.includes(truckId)), removedTruckIds: reference?.truckIds.filter((truckId) => !draft.selectedTruckIds.includes(truckId)) ?? [], fleetId, assignmentIdentity })
      : appendNewBaseFront({ fleetSetup: workspace.fleetSetup, masterData: workspace.masterData, sectorCode: workspace.shift.sectorCode, haulerCode: company, frontNumber: fleetSequence, destinationPileId, destinationPileIds: [destinationPileId], excaCode, truckIds: draft.selectedTruckIds, fleetId, assignmentIdentity })
  }, [assignmentIdentity, company, destinationPileId, draft.excaNumber, draft.selectedTruckIds, editorOpen, fleetId, fleetSequence, reference?.truckIds, referenceFrontId, selectedExca, sequenceValid, tab, workspace.fleetSetup, workspace.masterData, workspace.shift.sectorCode])
  const canSave = Boolean(candidate?.ok && sequenceValid && draft.excaNumber.trim() && draft.selectedTruckIds.length)
  const truckSearchActive = searchResultsOpen && Boolean(draft.truckQuery.trim())

  function resetForCompany(nextCompany: string) {
    setCompany(nextCompany); setDestinationPileId(''); setDestinationQuery(''); setReferenceFrontId(undefined); setTab('new')
    setActiveDraft(emptyDraft(suggestedNumber)); setNewDraft(emptyDraft(suggestedNumber)); setExcaTouched(false); setFleetNumberTouched(false); setSearchResultsOpen(false); setSaveError(undefined)
  }
  function selectDestination(option: SearchableComboboxOption) {
    setDestinationPileId(option.value); setDestinationQuery(''); setReferenceFrontId(undefined); setTab('new')
    setActiveDraft(emptyDraft(suggestedNumber)); setNewDraft(emptyDraft(suggestedNumber)); setExcaTouched(false); setFleetNumberTouched(false); setSearchResultsOpen(false); setSaveError(undefined)
  }
  function selectReference(frontId: string, truckIds: readonly string[]) {
    const front = referenceCandidates.find((candidate) => candidate.front.frontId === frontId)?.front
    setReferenceFrontId(frontId)
    setActiveDraft(emptyDraft(suggestedNumber, [...new Set(truckIds)], excaNumberFromCode(front?.excaCode)))
    setExcaTouched(false); setFleetNumberTouched(false); setSaveError(undefined)
  }
  function addTruck(truckId: string, keepSearchOpen = false) {
    updateDraft((current) => current.selectedTruckIds.includes(truckId) ? current : { ...current, selectedTruckIds: [...current.selectedTruckIds, truckId], removedTruckIds: current.removedTruckIds.filter((id) => id !== truckId), addedTruckIds: current.addedTruckIds.includes(truckId) ? current.addedTruckIds : [...current.addedTruckIds, truckId], truckQuery: keepSearchOpen ? current.truckQuery : '' })
    setSearchResultsOpen(keepSearchOpen)
    if (keepSearchOpen) requestAnimationFrame(() => document.getElementById('active-fleet-truck-search')?.focus())
  }
  function removeTruck(truckId: string) {
    updateDraft((current) => ({
      ...current,
      selectedTruckIds: current.selectedTruckIds.filter((id) => id !== truckId),
      addedTruckIds: current.addedTruckIds.filter((id) => id !== truckId),
      removedTruckIds: tab === 'active' && reference?.truckIds.includes(truckId) && !current.removedTruckIds.includes(truckId) ? [...current.removedTruckIds, truckId] : current.removedTruckIds,
    }))
  }
  function keepFocused(event: FocusEvent<HTMLInputElement>) {
    const input = event.currentTarget
    requestAnimationFrame(() => { if (input.isConnected && typeof input.scrollIntoView === 'function') input.scrollIntoView({ block: 'nearest' }) })
  }
  function save() {
    if (saving || !candidate || !candidate.ok || !canSave) return
    setSaving(true); setSaveError(undefined)
    const activatePiles = [destinationPileId]
      .map((destinationId) => workspace.masterData.pileAreas.find((pile) => pile.pileId === destinationId))
      .filter((area): area is NonNullable<typeof area> => Boolean(area))
      .filter((area) => !workspace.piles.some((pile) => pile.id === area.pileId))
      .map((area) => createPile(area.pileId, area.oreCode))
    void localOperationalStore.appendFrontContinuation(workspace.shiftId, { fleetSetup: candidate.value.fleetSetup, activatePiles }).then(async (saved) => {
      if (!saved.ok) { setSaving(false); setSaveError(`${saved.error.code}: ${saved.error.message}`); return }
      const reloaded = await localOperationalStore.loadShiftWorkspace(workspace.shiftId)
      if (!reloaded.ok) { setSaving(false); setSaveError(`${reloaded.error.code}: ${reloaded.error.message}`); return }
      const reloadedWorkspace = reloaded.value
      if (!reloadedWorkspace) { setSaving(false); setSaveError('Fleet was saved but the workspace could not be reloaded for verification.'); return }
      const savedFleet = reloadedWorkspace.fleetSetup.fleets.find((fleet) => fleet.fleetId === candidate.value.newFleet.fleetId)
      const projection = operationalFleetOptionsForDestinationPile(reloadedWorkspace.masterData, reloadedWorkspace.fleetSetup, destinationPileId as PileId)
      const confirmed = projection.ok && projection.value.some((fleet) => fleet.fleetId === savedFleet?.fleetId)
      if (!savedFleet || !confirmed) { setSaving(false); setSaveError('Fleet persistence was not confirmed for the selected Pile. Your draft remains open for retry.'); return }
      refreshWorkspace(); onClose()
    })
  }

  return <><div aria-hidden="true" data-ui="add-fleet-backdrop" className="fixed inset-0 z-40 bg-black/45" />
    <section data-ui="active-fleet-dialog" role="dialog" aria-modal="true" aria-label="Add Fleet" style={{ top: `${viewport.center}px`, maxHeight: `${viewport.maxHeight}px` }} className="fixed left-1/2 z-50 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated text-foreground shadow-2xl">
      <header className="relative flex min-h-14 shrink-0 items-center justify-end border-b border-border px-3"><h2 className="type-dialog-title pointer-events-none absolute left-1/2 -translate-x-1/2 text-lg font-semibold">Add Fleet</h2><button type="button" aria-label="Close Add Fleet" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={onClose}><X size={21} /></button></header>
      <div ref={bodyRef} className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className={company ? 'grid grid-cols-2 gap-2' : 'grid'}>
          <label className="sr-only" htmlFor="active-fleet-company">Company</label>
          <CustomSelect id="active-fleet-company" ariaLabel="Company" value={company} onChange={resetForCompany} placeholder="Select Company" preferAbove menuBoundaryRef={bodyRef} viewportOnly options={workspace.masterData.haulers.map((hauler) => ({ value: hauler.code as string, label: hauler.code as string }))} />
          {company ? <div className="min-w-0"><SearchableCombobox label="Pile" hideLabel query={destinationQuery} onQueryChange={setDestinationQuery} options={destinationCandidates} onSelect={selectDestination} selectedLabel={destinationPileId || undefined} clearLabel="Clear Pile selection" onClearSelection={() => { setDestinationQuery(''); setDestinationPileId('') }} placeholder="Select Pile" resultsAbove menuBoundaryRef={bodyRef} containerDataUi="active-fleet-destination" dataMaterial={selectedDestination?.oreCode} noResultsContent={<p className="text-sm text-muted-foreground">No eligible active Pile.</p>} /></div> : null}
        </div>
        {sourceReady ? <><div className="relative mt-3 ml-auto grid w-3/4 grid-cols-2 border-b border-border">
          <button type="button" className={`min-h-11 px-2 text-sm font-semibold ${tab === 'new' ? 'border-b-[3px] border-focus-accent text-focus-accent' : 'text-muted-foreground'}`} onClick={() => { setTab('new'); setSaveError(undefined) }}>New Fleet</button>
          <div className={`relative min-w-0 ${tab === 'active' ? 'border-b-[3px] border-focus-accent' : ''}`}>{activeEditorOpen ? <button type="button" aria-label="Back to Fleet Reference" className="absolute left-0 top-0 z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted" onClick={() => { setReferenceFrontId(undefined); setSaveError(undefined) }}><ArrowLeft size={20} /></button> : null}<button type="button" disabled={!referenceCandidates.length} className={`min-h-11 w-full min-w-0 whitespace-nowrap px-2 text-sm font-semibold disabled:opacity-50 ${activeEditorOpen ? 'pl-10' : ''} ${tab === 'active' ? 'text-focus-accent' : 'text-muted-foreground'}`} onClick={() => { setTab('active'); setSaveError(undefined) }}>Fleet Reference</button></div>
        </div>
          {tab === 'active' && !activeEditorOpen ? <div className="mt-3" data-ui="active-fleet-reference-list">{referenceCandidates.length ? <div className="scrollbar-none max-h-60 overflow-y-auto divide-y divide-border rounded-md border border-border">{referenceCandidates.map(({ front, fleet, truckIds }) => {
            const latestRevision = [...(fleet.excaConfigurationHistory ?? [])].sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime()).at(-1)
            const exca = latestRevision?.previousExcaCode && latestRevision.excaCode === front.excaCode
              ? `Exc: ${displayExcaCode(latestRevision.previousExcaCode).replace(/^Exc_/, '')} → ${displayExcaCode(front.excaCode).replace(/^Exc_/, '')}`
              : displayExcaCode(front.excaCode)
            return <button key={front.frontId} type="button" className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => selectReference(front.frontId, truckIds)}><span className="flex min-w-0 items-baseline gap-2"><span className="shrink-0 text-base font-bold text-foreground">F {String(frontNumberFromFrontId(front.frontId)).padStart(2, '0')}</span><span className="min-w-0 text-sm text-muted-foreground">{exca}</span></span><span className="flex min-w-0 items-baseline justify-end gap-2"><span className="shrink-0 text-sm text-muted-foreground">{truckIds.length} {truckIds.length === 1 ? 'Truck' : 'Trucks'}</span><span className="max-w-[11rem] break-words text-right text-base font-bold text-foreground">{destinationPileIdsForFront(front).map(String).join(' · ') || 'No Pile'}</span></span></button>
          })}</div> : <p className="py-5 text-center text-sm text-muted-foreground">No eligible Fleet Reference.</p>}</div> : null}
          {editorOpen ? <div className="mt-3 space-y-3" data-ui="active-fleet-inline-editor">
            <div className="grid grid-cols-2 gap-2"><div className="flex min-w-0 flex-col gap-1"><label htmlFor="active-fleet-front-number" className={`flex min-h-8 min-w-0 items-center gap-1 text-sm font-medium ${sequenceError ? 'text-danger' : 'text-muted-foreground'}`}>{sequenceError ? <><span>Fleet No:</span><span id="active-fleet-number-status" role="alert" className="min-w-0 break-words rounded-sm border border-danger/60 bg-danger/10 px-1.5 py-0.5 text-sm font-semibold leading-tight text-danger">{sequenceError}</span></> : fullFleetCode ? <><span>Fleet Id:</span><span title={fullFleetCode} className="min-w-0 break-all rounded-sm border border-focus-accent/60 bg-focus-accent-soft px-1.5 py-0.5 text-[0.9375rem] font-semibold leading-tight text-foreground">{fullFleetCode}</span></> : 'Fleet No'}</label><input id="active-fleet-front-number" aria-label="Fleet No" aria-invalid={Boolean(sequenceError) || undefined} aria-describedby={sequenceError ? 'active-fleet-number-status' : undefined} value={draft.frontNumber} inputMode="numeric" pattern="[0-9]*" onBlur={() => setFleetNumberTouched(true)} onChange={(event) => updateDraft((current) => ({ ...current, frontNumber: event.target.value.replace(/\D/g, '') }))} placeholder={suggestedNumber} className={`ui-control h-11 min-w-0 ${sequenceError ? 'border-danger' : ''}`} /></div><div className="flex min-w-0 flex-col gap-1"><label htmlFor="active-fleet-exca" className={`flex min-h-8 min-w-0 items-center gap-1 text-sm font-medium ${excaValidationError ? 'text-danger' : 'text-muted-foreground'}`}>{excaValidationError ? <><span>Exca ID:</span><span id="active-fleet-exca-status" role="alert" className="min-w-0 break-words rounded-sm border border-danger/60 bg-danger/10 px-1.5 py-0.5 text-sm font-semibold leading-tight text-danger">{excaValidationError}</span></> : selectedExca?.ok ? <><span>Exca ID:</span><span title={selectedExca.value} className="min-w-0 break-all rounded-sm border border-focus-accent/60 bg-focus-accent-soft px-1.5 py-0.5 text-[0.9375rem] font-semibold leading-tight text-foreground">{selectedExca.value}</span></> : 'Exca ID'}</label><input id="active-fleet-exca" aria-label="Exca ID" aria-invalid={Boolean(excaValidationError) || undefined} aria-describedby={excaValidationError ? 'active-fleet-exca-status' : undefined} value={draft.excaNumber} inputMode="numeric" onBlur={() => setExcaTouched(true)} onChange={(event) => updateDraft((current) => ({ ...current, excaNumber: event.target.value }))} placeholder="Exca No." className={`ui-control h-11 min-w-0 ${excaValidationError ? 'border-danger' : ''}`} /></div></div>
            {truckSearchActive ? <TruckSearchColumns selectedTruckIds={draft.selectedTruckIds} addedTruckIds={draft.addedTruckIds} searchTruckIds={truckSearchCandidates} prioritizeAdded={tab === 'active'} selectedTone={tab === 'new' ? 'lime' : 'amber'} onClose={() => setSearchResultsOpen(false)} onRemove={removeTruck} onAdd={addTruck} /> : tab === 'active' ? <div className="grid grid-cols-2 gap-2"><TruckList title="Removed" truckIds={draft.removedTruckIds} addedTruckIds={[]} action="add" onAction={addTruck} /><TruckList title="Selected Trucks" truckIds={draft.selectedTruckIds} addedTruckIds={draft.addedTruckIds} action="remove" onAction={removeTruck} /></div> : <TruckGrid truckIds={draft.selectedTruckIds} addedTruckIds={draft.addedTruckIds} onRemove={removeTruck} />}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2"><label htmlFor="active-fleet-truck-search" className="whitespace-nowrap text-sm font-medium">Add Truck</label><input id="active-fleet-truck-search" aria-label="Add Truck" value={draft.truckQuery} onFocus={(event) => { keepFocused(event); if (event.currentTarget.value.trim()) setSearchResultsOpen(true) }} onChange={(event) => { updateDraft((current) => ({ ...current, truckQuery: event.target.value })); setSearchResultsOpen(Boolean(event.target.value.trim())) }} placeholder="Search Truck ID" className="ui-control h-11 min-w-0" /></div>
            {candidate && !candidate.ok && !sequenceSuggestion.duplicate ? <p role="alert" className="text-sm text-danger">{candidate.error.code}</p> : null}
          </div> : null}</> : null}
        {saveError ? <p role="alert" className="mt-3 text-sm text-danger">{saveError}</p> : null}
      </div>
      {editorOpen ? <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-surface-elevated px-4 py-3"><Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>Cancel</Button><Button type="button" variant="focus" data-ui="active-fleet-save" className="min-h-11" disabled={saving || !canSave} onClick={save}>Save Fleet</Button></footer> : null}
    </section></>
}

function orderedTrucks(truckIds: readonly string[], addedTruckIds: readonly string[], prioritizeAdded = true) {
  const added = new Set(addedTruckIds)
  const natural = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  return [...truckIds].sort((left, right) => prioritizeAdded ? Number(added.has(right)) - Number(added.has(left)) || natural(left, right) : natural(left, right))
}

function TruckList({ title, truckIds, addedTruckIds, action, onAction, prioritizeAdded = true, addedTone = 'amber', listClassName = 'h-40' }: { title: string; truckIds: readonly string[]; addedTruckIds: readonly string[]; action: 'add' | 'remove'; onAction: (truckId: string) => void; prioritizeAdded?: boolean; addedTone?: 'amber' | 'lime'; listClassName?: string }) {
  const ordered = orderedTrucks(truckIds, addedTruckIds, prioritizeAdded)
  const addedFill = addedTone === 'lime' ? 'bg-focus-accent/15' : 'bg-amber-100/60 dark:bg-amber-950/35'
  return <section className="flex min-w-0 flex-col"><h3 className="mb-1 flex min-h-8 items-center justify-between gap-1 px-1 text-sm font-semibold text-muted-foreground"><span className="min-w-0 truncate">{title}</span><TruckCount value={truckIds.length} tone={title === 'Removed' ? 'danger' : 'focus'} /></h3><div data-ui="active-fleet-truck-list-frame" className="min-h-0 rounded-md border border-border p-1"><ul className={`scrollbar-none min-h-0 overflow-y-auto ${listClassName}`}>{ordered.length ? ordered.map((truckId) => <li key={truckId} className={`flex min-h-10 min-w-0 items-center justify-between gap-1 border-t border-border px-2 text-sm first:border-t-0 ${addedTruckIds.includes(truckId) ? addedFill : ''}`}><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" aria-label={`${action === 'add' ? 'Add' : 'Remove'} ${truckId}`} className={`flex size-11 shrink-0 items-center justify-center ${action === 'remove' ? 'text-danger' : 'text-focus-accent'}`} onClick={() => onAction(truckId)}>{action === 'add' ? <Plus size={18} /> : <X size={18} />}</button></li>) : <li className="p-2 text-sm text-muted-foreground">No trucks.</li>}</ul></div></section>
}

function TruckGrid({ truckIds, addedTruckIds, onRemove }: { truckIds: readonly string[]; addedTruckIds: readonly string[]; onRemove: (truckId: string) => void }) {
  const ordered = orderedTrucks(truckIds, addedTruckIds, false)
  return <section data-ui="active-fleet-selected-grid" className="flex min-w-0 flex-col"><h3 className="mb-1 flex min-h-8 items-center justify-between text-sm font-semibold text-muted-foreground"><span>Selected Trucks</span><TruckCount value={truckIds.length} /></h3><div data-ui="active-fleet-truck-list-frame" className="min-h-0 rounded-md border border-focus-accent/60 p-2"><ul className="scrollbar-none grid max-h-40 grid-cols-2 gap-px overflow-y-auto bg-border">{ordered.length ? ordered.map((truckId) => <li key={truckId} className={`flex min-h-10 min-w-0 items-center justify-between gap-1 px-2 text-sm ${addedTruckIds.includes(truckId) ? 'bg-focus-accent/15' : 'bg-surface'}`}><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" aria-label={`Remove ${truckId}`} className="flex size-10 shrink-0 items-center justify-center text-danger" onClick={() => onRemove(truckId)}><X size={18} /></button></li>) : <li className="col-span-2 bg-surface p-2 text-sm text-muted-foreground">No trucks selected.</li>}</ul></div></section>
}

function TruckCount({ value, tone = 'focus' }: { value: number; tone?: 'focus' | 'danger' }) {
  const colors = tone === 'danger' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-focus-accent/60 bg-focus-accent-soft text-focus-accent'
  return <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${colors}`}>{value} {value === 1 ? 'Truck' : 'Trucks'}</span>
}

function TruckSearchColumns({ selectedTruckIds, addedTruckIds, searchTruckIds, prioritizeAdded, selectedTone, onClose, onRemove, onAdd }: { selectedTruckIds: readonly string[]; addedTruckIds: readonly string[]; searchTruckIds: readonly string[]; prioritizeAdded: boolean; selectedTone: 'amber' | 'lime'; onClose: () => void; onRemove: (truckId: string) => void; onAdd: (truckId: string, keepSearchOpen?: boolean) => void }) {
  const boundedList = 'h-[min(220px,35dvh)]'
  return <div data-ui="active-fleet-truck-search-columns" className="grid min-h-0 grid-cols-2 gap-2"><TruckList title="Selected Trucks" truckIds={selectedTruckIds} addedTruckIds={addedTruckIds} action="remove" onAction={onRemove} prioritizeAdded={prioritizeAdded} addedTone={selectedTone} listClassName={boundedList} /><TruckCandidates truckIds={searchTruckIds} listClassName={boundedList} onClose={onClose} onAdd={onAdd} /></div>
}

function TruckCandidates({ truckIds, listClassName, onClose, onAdd }: { truckIds: readonly string[]; listClassName: string; onClose: () => void; onAdd: (truckId: string, keepSearchOpen?: boolean) => void }) {
  return <section data-ui="active-fleet-truck-results" className="flex min-w-0 flex-col rounded-md border border-border p-1"><h3 className="mb-1 flex min-h-8 items-center justify-between gap-1 px-1 text-sm font-medium"><span className="truncate">Search Results</span><button type="button" aria-label="Close Search Results" className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose}><X size={17} /></button></h3><ul role="listbox" aria-label="Truck search results" className={`scrollbar-none min-h-0 overflow-y-auto ${listClassName}`}>{truckIds.length ? truckIds.map((truckId) => <li key={truckId} className="flex min-h-11 min-w-0 items-center border-t border-border first:border-t-0"><button type="button" role="option" className="min-w-0 flex-1 px-2 text-left text-sm hover:bg-muted" onClick={() => onAdd(truckId)}><span className="font-medium">{truckId}</span></button><button type="button" aria-label={`Add ${truckId} and keep searching`} className="flex size-11 shrink-0 items-center justify-center text-focus-accent hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); onAdd(truckId, true) }}><Plus size={18} /></button></li>) : <li className="p-2 text-sm text-muted-foreground">No eligible Truck ID.</li>}</ul></section>
}
