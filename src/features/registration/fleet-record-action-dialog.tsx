import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { reconfigureActiveFrontFleet } from '@/application/fleet-setup/reconfigure-active-front-fleet'
import { SearchableCombobox } from '@/components/shared/SearchableCombobox'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/custom-select'
import { buildExcaCode, excaNumberFromCode } from '@/domain/fleet/exca-code'
import { destinationPileIdsForFront } from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { fleetActivationVersion } from '@/domain/fleet/fleet-operational-state'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'

export type FleetRecordActionMode = 'edit' | 'reactivate'

interface FleetRecordActionDialogProps { readonly fleetId: string; readonly mode: FleetRecordActionMode; readonly onClose: () => void }

/** Edits an ACTIVE Fleet's operational configuration without changing its identity. */
export function FleetRecordActionDialog({ fleetId, mode, onClose }: FleetRecordActionDialogProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const fleet = workspace.fleetSetup.fleets.find((candidate) => candidate.fleetId === fleetId)
  const front = fleet ? workspace.fleetSetup.fronts.find((candidate) => candidate.frontId === fleet.frontId) : undefined
  const effective = fleet ? resolveEffectiveFleetAgainstMaster(workspace.masterData, workspace.fleetSetup, fleet.fleetId) : undefined
  const initialTruckIds = effective?.ok ? effective.value.truckIds.map(String) : []
  const [initialSelectedTruckIds, setInitialSelectedTruckIds] = useState<readonly string[]>(initialTruckIds)
  const [truckIds, setTruckIds] = useState<readonly string[]>(initialTruckIds)
  const [destinationPileIds, setDestinationPileIds] = useState<readonly string[]>(() => front ? destinationPileIdsForFront(front).map(String) : [])
  const [pileQuery, setPileQuery] = useState('')
  const [lockedPileIds, setLockedPileIds] = useState<ReadonlySet<string>>(new Set())
  const [excaNumber, setExcaNumber] = useState(excaNumberFromCode(front?.excaCode))
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [reactivationMode, setReactivationMode] = useState<'new' | 'reference'>('new')
  const [sourceFleetId, setSourceFleetId] = useState('')
  const company = front?.haulerCode as string | undefined
  const activeFrontIds = useMemo(() => new Set(deriveFrontLineage(workspace.fleetSetup).activeFrontIds), [workspace.fleetSetup])
  const referenceOptions = useMemo(() => workspace.fleetSetup.fleets
    .filter((candidate) => candidate.fleetId !== fleetId && activeFrontIds.has(candidate.frontId))
    .map((candidate) => {
      const candidateFront = workspace.fleetSetup.fronts.find((front) => front.frontId === candidate.frontId)
      return candidateFront?.haulerCode === company ? { value: candidate.fleetId as string, label: candidate.assignmentIdentity?.fleetCode ?? candidate.frontId as string } : undefined
    }).filter((option): option is { value: string; label: string } => Boolean(option)), [activeFrontIds, company, fleetId, workspace.fleetSetup])
  const companyName = workspace.masterData.haulers.find((hauler) => hauler.code === company)?.name || company
  const activePileIds = useMemo(() => new Set(workspace.pileRegistrations.filter((row) => row.status === 'ACTIVE').map((row) => row.pileId as string)), [workspace.pileRegistrations])
  const pileById = useMemo(() => new Map(workspace.masterData.pileAreas.map((pile) => [pile.pileId as string, pile])), [workspace.masterData.pileAreas])
  const selectedPileMaterials = useMemo(() => [...new Set(destinationPileIds.map((pileId) => String(pileById.get(pileId)?.oreCode ?? '').trim()).filter(Boolean))], [destinationPileIds, pileById])
  const historicalPileMaterials = useMemo(() => [...new Set([...lockedPileIds].map((pileId) => String(pileById.get(pileId)?.oreCode ?? '').trim()).filter(Boolean))], [lockedPileIds, pileById])
  const materialConflict = selectedPileMaterials.length > 1 || historicalPileMaterials.length > 1
  const enforcedMaterial = historicalPileMaterials[0] ?? selectedPileMaterials[0]
  const pileOptions = useMemo(() => workspace.masterData.pileAreas.filter((pile) => pile.sectorCode === workspace.shift.sectorCode && activePileIds.has(pile.pileId as string)).filter((pile) => !destinationPileIds.includes(pile.pileId as string)).filter((pile) => !enforcedMaterial || String(pile.oreCode) === enforcedMaterial).map((pile) => ({ value: pile.pileId as string, label: pile.pileId as string, material: pile.oreCode as string })), [activePileIds, destinationPileIds, enforcedMaterial, workspace.masterData.pileAreas, workspace.shift.sectorCode])
  const searchingTrucks = Boolean(query.trim())
  const removedTruckIds = useMemo(
    () => initialSelectedTruckIds.filter((truckId) => !truckIds.includes(truckId)),
    [initialSelectedTruckIds, truckIds],
  )
  const truckCandidates = useMemo(() => workspace.masterData.trucks.filter((truck) => truck.haulerCode === company).map((truck) => truck.id as string).filter((truckId) => !truckIds.includes(truckId)).filter((truckId) => truckId.toLowerCase().includes(query.trim().toLowerCase())).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), [company, query, truckIds, workspace.masterData.trucks])
  const recentExcaAssignments = useMemo(() => {
    const assignments: string[] = []
    const revisions = [...(fleet?.excaConfigurationHistory ?? [])].sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.recordedAt.getTime() - right.recordedAt.getTime())
    for (const revision of revisions) {
      if (revision.previousExcaCode && assignments.at(-1) !== revision.previousExcaCode) assignments.push(revision.previousExcaCode)
      if (assignments.at(-1) !== revision.excaCode) assignments.push(revision.excaCode)
    }
    return assignments.slice(-2)
  }, [fleet?.excaConfigurationHistory])

  useEffect(() => {
    let live = true
    void localOperationalStore.listProductionRecordsForShift(workspace.shiftId).then((result) => {
      if (!live || !result.ok) return
      setLockedPileIds(new Set(result.value.filter((record) => record.transaction.fleetId === fleetId || record.effective.fleetId === fleetId).map((record) => record.transaction.pileId as string)))
    })
    return () => { live = false }
  }, [fleetId, workspace.shiftId])

  if (!fleet || !front || !effective?.ok || !company) return null
  const addTruck = (truckId: string) => setTruckIds((current) => current.includes(truckId) ? current : [...current, truckId])
  const removeTruck = (truckId: string) => setTruckIds((current) => current.filter((id) => id !== truckId))
  const addPile = (pileId: string) => {
    const material = String(pileById.get(pileId)?.oreCode ?? '').trim()
    if (!material || materialConflict || (enforcedMaterial && material !== enforcedMaterial)) { setError('Selected Pile must use the Fleet Material Type from master data.'); return }
    if (pileId) setDestinationPileIds((current) => current.includes(pileId) ? current : [...current, pileId])
    setPileQuery('')
  }
  const removePile = (pileId: string) => {
    if (lockedPileIds.has(pileId)) { setError(`Pile ${pileId} has Production history and cannot be removed.`); return }
    setDestinationPileIds((current) => current.length > 1 ? current.filter((id) => id !== pileId) : current)
  }
  const selectNewReactivation = () => {
    setReactivationMode('new')
    setSourceFleetId('')
    setInitialSelectedTruckIds(initialTruckIds)
    setTruckIds(initialTruckIds)
    setDestinationPileIds(destinationPileIdsForFront(front).map(String))
    setExcaNumber(excaNumberFromCode(front.excaCode))
    setQuery('')
  }

  async function selectReference(nextSourceFleetId: string) {
    setSourceFleetId(nextSourceFleetId)
    const sourceFleet = workspace.fleetSetup.fleets.find((candidate) => candidate.fleetId === nextSourceFleetId)
    const sourceFront = sourceFleet && workspace.fleetSetup.fronts.find((candidate) => candidate.frontId === sourceFleet.frontId)
    const sourceEffective = sourceFleet ? resolveEffectiveFleetAgainstMaster(workspace.masterData, workspace.fleetSetup, sourceFleet.fleetId) : undefined
    if (!sourceFront || !sourceEffective?.ok) return
    const sourceTruckIds = sourceEffective.value.truckIds.map(String)
    setInitialSelectedTruckIds(sourceTruckIds)
    setTruckIds(sourceTruckIds)
    setDestinationPileIds(destinationPileIdsForFront(sourceFront).map(String))
    setExcaNumber(excaNumberFromCode(sourceFront.excaCode))
    setQuery('')
  }

  async function save() {
    if (saving) return
    if (!destinationPileIds.length) { setError('At least one Pile is required.'); return }
    setSaving(true); setError(undefined)
    try {
      const latest = await localOperationalStore.loadShiftWorkspace(workspace.shiftId)
      if (!latest.ok || !latest.value) { setError(latest.ok ? 'Unable to reload the Fleet before saving.' : `${latest.error.code}: ${latest.error.message}`); return }
      const latestFleet = latest.value.fleetSetup.fleets.find((candidate) => candidate.fleetId === fleetId)
      const latestFront = latestFleet ? latest.value.fleetSetup.fronts.find((candidate) => candidate.frontId === latestFleet.frontId) : undefined
      if (!latestFleet || !latestFront) { setError('This Fleet no longer exists in the current workspace. Reload and try again.'); return }
      const exca = buildExcaCode(latestFront.haulerCode as string, excaNumber)
      if (!exca.ok) { setError(`${exca.error.code}: ${exca.error.message}`); return }
      if (mode === 'reactivate') {
        const targetVersion = fleetActivationVersion(latest.value.fleetSetup.operationalState, latestFleet.fleetId)
        const sourceVersion = sourceFleetId ? fleetActivationVersion(latest.value.fleetSetup.operationalState, sourceFleetId as typeof latestFleet.fleetId) : undefined
        const saved = await localOperationalStore.reactivateFleet(workspace.shiftId, { fleetId: latestFleet.fleetId as string, ...(reactivationMode === 'reference' ? { sourceFleetId } : {}), truckIds, destinationPileIds, excaCode: exca.value, commandId: crypto.randomUUID(), actorId: 'CHECKER', effectiveAt: new Date(), expectedTargetVersion: targetVersion, ...(sourceVersion !== undefined ? { expectedSourceVersion: sourceVersion } : {}) })
        if (!saved.ok) { setError(`${saved.error.code}: ${saved.error.message}`); return }
        const verified = await localOperationalStore.loadShiftWorkspace(workspace.shiftId)
        const verifiedLineage = verified.ok && verified.value ? deriveFrontLineage(verified.value.fleetSetup) : undefined
        const verifiedTarget = verifiedLineage?.activeFrontIds.includes(latestFront.frontId)
        const sourceFleet = sourceFleetId ? verified.ok && verified.value?.fleetSetup.fleets.find((candidate) => candidate.fleetId === sourceFleetId) : undefined
        const verifiedSourceInactive = !sourceFleet || !verifiedLineage?.activeFrontIds.includes(sourceFleet.frontId)
        if (!verifiedTarget || !verifiedSourceInactive) { setError('Reactivation was saved but could not be verified after reload.'); return }
        refreshWorkspace(); onClose(); return
      }
      const candidate = reconfigureActiveFrontFleet({
        fleetSetup: latest.value.fleetSetup, masterData: latest.value.masterData, frontId: latestFront.frontId, destinationPileIds, excaCode: exca.value, truckIds,
        ...(latestFront.excaCode !== exca.value ? { excaRevision: { revisionId: crypto.randomUUID(), fleetAssignmentId: latestFleet.fleetId, previousExcaCode: latestFront.excaCode, excaCode: exca.value, effectiveAt: new Date(), recordedAt: new Date(), actorId: 'CHECKER' } } : {}),
      })
      if (!candidate.ok) { setError(`${candidate.error.code}: ${candidate.error.message}`); return }
      const saved = await localOperationalStore.updateActiveFrontFleetWithProductionGuard(workspace.shiftId, latestFleet.fleetId, candidate.value.fleetSetup, false)
      if (!saved.ok) { setError(`${saved.error.code}: ${saved.error.message}`); return }
      const verified = await localOperationalStore.loadShiftWorkspace(workspace.shiftId)
      if (!verified.ok || !verified.value) { setError(verified.ok ? 'Fleet was saved but could not be reloaded for verification.' : `${verified.error.code}: ${verified.error.message}`); return }
      const savedFleet = verified.value.fleetSetup.fleets.find((candidate) => candidate.fleetId === latestFleet.fleetId)
      const savedFront = savedFleet ? verified.value.fleetSetup.fronts.find((candidate) => candidate.frontId === savedFleet.frontId) : undefined
      const savedEffective = savedFleet ? resolveEffectiveFleetAgainstMaster(verified.value.masterData, verified.value.fleetSetup, savedFleet.fleetId) : undefined
      const sameTrucks = savedEffective?.ok && savedEffective.value.truckIds.map(String).sort().join('|') === [...truckIds].sort().join('|')
      const samePiles = savedFront && destinationPileIdsForFront(savedFront).map(String).sort().join('|') === [...destinationPileIds].sort().join('|')
      const excaChanged = latestFront.excaCode !== exca.value
      const savedExcaRevision = savedFleet?.excaConfigurationHistory?.some((revision) => revision.fleetAssignmentId === latestFleet.fleetId && revision.previousExcaCode === latestFront.excaCode && revision.excaCode === exca.value)
      if (!sameTrucks || !samePiles || savedFront?.excaCode !== exca.value || (excaChanged && !savedExcaRevision)) { setError('Fleet was saved but could not be verified after reload. The dialog remains open.'); return }
      refreshWorkspace(); onClose()
    } finally { setSaving(false) }
  }

  return <><div aria-hidden="true" className="fixed inset-0 z-40 bg-black/45" />
    <section role="dialog" aria-modal="true" aria-label={`${mode === 'reactivate' ? 'Reactivate' : 'Edit'} Fleet ${front.frontId}`} className="fixed inset-x-3 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-24px)] w-auto max-w-md -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated text-foreground shadow-2xl">
      <header className="flex min-h-14 items-center justify-between border-b border-border px-4"><h2 className="type-dialog-title">{mode === 'reactivate' ? 'Reactivation' : 'Edit Fleet'}</h2><button type="button" aria-label="Close Fleet action" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={onClose}><X aria-hidden="true" size={20} /></button></header>
      <div ref={bodyRef} className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {mode === 'reactivate' ? <div data-ui="fleet-edit-identity" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1"><p className="col-span-2 min-w-0 truncate text-base font-semibold leading-tight" title={companyName}>{companyName}</p><p className="min-w-0 break-all text-sm font-semibold leading-tight">{fleet.assignmentIdentity?.fleetCode ?? front.frontId}</p><p data-ui="fleet-edit-selected-pile-count" className="text-right text-sm font-medium text-muted-foreground">{destinationPileIds.length} Selected {destinationPileIds.length === 1 ? 'Pile' : 'Piles'}</p></div> : <div data-ui="fleet-edit-identity" className="grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,.85fr)] items-start gap-x-3 gap-y-1"><p className="min-w-0 truncate text-base font-semibold leading-tight" title={companyName}>{companyName}</p><p data-ui="fleet-edit-exca-history" className="min-w-0 whitespace-nowrap text-right text-xs font-medium text-muted-foreground">{recentExcaAssignments.length === 2 ? <>Exc: {excaNumberFromCode(recentExcaAssignments[0]).padStart(4, '0')} → {excaNumberFromCode(recentExcaAssignments[1]).padStart(4, '0')}</> : null}</p><p className="min-w-0 break-all text-sm font-semibold leading-tight">{fleet.assignmentIdentity?.fleetCode ?? front.frontId}</p><p data-ui="fleet-edit-selected-pile-count" className="text-right text-sm font-medium text-muted-foreground">{destinationPileIds.length} Selected {destinationPileIds.length === 1 ? 'Pile' : 'Piles'}</p></div>}
        {mode === 'reactivate' ? <div role="tablist" aria-label="Reactivation source" className="grid grid-cols-2 border-b border-border"><button role="tab" aria-selected={reactivationMode === 'new'} type="button" className={`min-h-11 font-semibold ${reactivationMode === 'new' ? 'border-b-[3px] border-focus-accent text-focus-accent' : 'text-muted-foreground'}`} onClick={selectNewReactivation}>New Fleet</button><button role="tab" aria-selected={reactivationMode === 'reference'} type="button" className={`min-h-11 whitespace-nowrap font-semibold ${reactivationMode === 'reference' ? 'border-b-[3px] border-focus-accent text-focus-accent' : 'text-muted-foreground'}`} onClick={() => setReactivationMode('reference')}>Fleet Reference</button></div> : null}
        <section aria-label="Selected Piles" className="min-w-0"><div data-ui="fleet-edit-pile-list-frame" className="rounded-md border border-border p-1"><ul className="grid grid-cols-3 gap-1">{destinationPileIds.map((pileId) => {
          const material = pileById.get(pileId)?.oreCode as string | undefined
          return <li key={pileId} data-material={material} className="fleet-edit-pile-chip flex min-h-9 min-w-0 items-center justify-between gap-0.5 rounded-sm border px-1.5 text-sm"><span className="min-w-0 truncate font-semibold">{pileId}</span><button type="button" aria-label={`Remove Pile ${pileId}`} disabled={destinationPileIds.length === 1 || lockedPileIds.has(pileId)} title={lockedPileIds.has(pileId) ? 'Pile has Production history and cannot be removed' : destinationPileIds.length === 1 ? 'At least one Pile is required' : undefined} className="flex size-7 shrink-0 items-center justify-center text-danger disabled:cursor-not-allowed disabled:opacity-40" onClick={() => removePile(pileId)}><X size={15} /></button></li>
        })}</ul></div></section>
        {materialConflict ? <p role="alert" className="text-sm text-danger">Existing Fleet Piles have mixed Material Types. Resolve the conflict explicitly before adding a Pile.</p> : null}
        {mode === 'reactivate' && reactivationMode === 'reference' ? <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2"><label htmlFor="reactivation-reference" className="whitespace-nowrap text-sm font-medium">Reference</label><CustomSelect id="reactivation-reference" ariaLabel="Reference" value={sourceFleetId} onChange={(value) => void selectReference(value)} placeholder="Select active Fleet" options={referenceOptions} menuBoundaryRef={bodyRef} /></div> : null}
        <div className="grid grid-cols-[auto_minmax(4rem,.55fr)_minmax(0,1fr)] items-center gap-2"><label htmlFor="fleet-edit-exca" className="whitespace-nowrap text-sm font-medium">Exca ID</label><input id="fleet-edit-exca" aria-label="Exca ID" value={excaNumber} inputMode="numeric" onChange={(event) => setExcaNumber(event.target.value)} className="ui-control h-11 min-w-0" /><SearchableCombobox label="Add Pile" query={pileQuery} onQueryChange={setPileQuery} options={pileOptions} onSelect={(option) => addPile(option.value)} clearLabel="Clear Pile" onClearSelection={() => setPileQuery('')} placeholder="Search Pile" hideLabel noResultsContent={enforcedMaterial ? `No eligible ${enforcedMaterial} Pile in this sector.` : 'No active Pile in this sector.'} containerDataUi="fleet-edit-add-pile" /></div>
        <div data-ui="fleet-edit-truck-columns" data-searching={searchingTrucks || undefined} className="grid min-h-0 grid-cols-2 gap-3">
          {searchingTrucks ? <section className="flex min-w-0 flex-col">
            <h3 className="mb-1 flex min-h-8 items-center justify-between gap-1 px-1 text-sm font-semibold text-muted-foreground"><span className="min-w-0 truncate">Selected Trucks</span><span data-ui="fleet-edit-selected-truck-count" className="rounded-full bg-focus-accent-soft px-2 py-0.5 text-xs font-semibold text-focus-accent">{truckIds.length} {truckIds.length === 1 ? 'Truck' : 'Trucks'}</span></h3>
            <div data-ui="fleet-edit-selected-trucks" className="min-h-0 rounded-md border border-border p-1"><ul className="scrollbar-none h-40 overflow-y-auto">{truckIds.length ? truckIds.map((truckId) => <li key={truckId} className="flex min-h-10 min-w-0 items-center justify-between gap-1 border-t border-border px-2 text-sm first:border-t-0"><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" aria-label={`Remove ${truckId}`} className="flex size-10 shrink-0 items-center justify-center text-danger" onClick={() => removeTruck(truckId)}><X size={18} /></button></li>) : <li className="p-2 text-sm text-muted-foreground">No trucks selected.</li>}</ul></div>
          </section> : <section data-ui="fleet-edit-removed-trucks" className="flex min-w-0 flex-col"><h3 className="mb-1 flex min-h-8 items-center justify-between gap-1 px-1 text-sm font-semibold text-muted-foreground"><span className="min-w-0 truncate">Removed</span><span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{removedTruckIds.length} {removedTruckIds.length === 1 ? 'Truck' : 'Trucks'}</span></h3><div className="min-h-0 rounded-md border border-border p-1"><ul className="scrollbar-none h-40 overflow-y-auto">{removedTruckIds.length ? removedTruckIds.map((truckId) => <li key={truckId} className="flex min-h-10 min-w-0 items-center justify-between gap-1 border-t border-border px-2 text-sm first:border-t-0"><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" aria-label={`Restore ${truckId}`} className="flex size-10 shrink-0 items-center justify-center text-focus-accent" onClick={() => addTruck(truckId)}><Plus size={18} /></button></li>) : <li className="p-2 text-sm text-muted-foreground">No trucks.</li>}</ul></div></section>}
          {searchingTrucks ? <section data-ui="fleet-edit-truck-results" className="flex min-w-0 flex-col">
            <h3 className="mb-1 min-h-8 px-1 text-sm font-semibold text-muted-foreground">Search Results</h3>
            <div className="min-h-0 rounded-md border border-border p-1"><ul role="listbox" aria-label="Eligible Trucks" className="scrollbar-none h-40 overflow-y-auto">{truckCandidates.length ? truckCandidates.map((truckId) => <li key={truckId} className="flex min-h-10 min-w-0 items-center border-t border-border first:border-t-0"><button type="button" role="option" className="flex min-w-0 flex-1 items-center justify-between gap-1 px-2 text-left text-sm text-focus-accent hover:bg-muted" onClick={() => addTruck(truckId)}><span className="min-w-0 truncate font-medium">{truckId}</span><Plus aria-hidden="true" size={18} /></button></li>) : <li className="p-2 text-sm text-muted-foreground">No eligible same-company Truck.</li>}</ul></div>
          </section> : <section className="flex min-w-0 flex-col"><h3 className="mb-1 flex min-h-8 items-center justify-between gap-1 px-1 text-sm font-semibold text-muted-foreground"><span className="min-w-0 truncate">Selected Trucks</span><span data-ui="fleet-edit-selected-truck-count" className="rounded-full bg-focus-accent-soft px-2 py-0.5 text-xs font-semibold text-focus-accent">{truckIds.length} {truckIds.length === 1 ? 'Truck' : 'Trucks'}</span></h3><div data-ui="fleet-edit-selected-trucks" className="min-h-0 rounded-md border border-border p-1"><ul className="scrollbar-none h-40 overflow-y-auto">{truckIds.length ? truckIds.map((truckId) => <li key={truckId} className="flex min-h-10 min-w-0 items-center justify-between gap-1 border-t border-border px-2 text-sm first:border-t-0"><span className="min-w-0 truncate font-medium">{truckId}</span><button type="button" aria-label={`Remove ${truckId}`} className="flex size-10 shrink-0 items-center justify-center text-danger" onClick={() => removeTruck(truckId)}><X size={18} /></button></li>) : <li className="p-2 text-sm text-muted-foreground">No trucks selected.</li>}</ul></div></section>}
        </div>
        <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm font-medium"><span className="whitespace-nowrap">Search Truck ID</span><input aria-label="Search Truck ID" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Truck ID" className="ui-control h-11 min-w-0" /></label>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
      <footer className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3"><Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>Cancel</Button><Button type="button" variant="focus" className="min-h-11" disabled={saving || (mode === 'reactivate' && reactivationMode === 'reference' && !sourceFleetId)} onClick={() => void save()}>{mode === 'reactivate' ? 'Save Reactivation' : 'Save Changes'}</Button></footer>
    </section>
  </>
}
