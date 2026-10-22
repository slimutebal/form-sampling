import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { adjustFrontFleet } from '@/application/fleet-setup/adjust-front-fleet'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { generateHaulageTransactionId as defaultGenerateHaulageTransactionId, type HaulageTransactionIdGenerator } from '@/application/haulage-operation/haulage-id-generator'
import { operationalFleetOptionsForDestinationPileTruck, operationalTruckOptionsForDestinationPile, type OperationalFleetOption } from '@/application/haulage-operation/operational-fleet-options'
import { previewNextSampling } from '@/application/haulage-operation/next-sampling-preview'
import { deriveMissedRits } from '@/application/production/missed-rit'
import { currentPositionForRegistration, deriveOperationalBatchStates, formatBatchCode, formatTripWithinBatch, hasEffectiveProductionForRegistration, nextPositionForRegistration } from '@/application/production/production-record-presentation'
import type { ProductionRecordStore } from '@/application/production/production-record-store'
import { recordProduction } from '@/application/production/record-production'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import type { BatchPosition } from '@/domain/batch/batch-position'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { displayExcaCode } from '@/domain/fleet/exca-code'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { findOreSamplingConfig, findPileArea, type MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import { CONTAMINATIONS, DISPOSITIONS, PHYSICAL_CONDITIONS, type Contamination, type Disposition, type PhysicalCondition, type ProductionRecord } from '@/domain/production/production-record'
import type { Shift } from '@/domain/shift/shift'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/components/ui/cn'

export interface ProductionRecordEntryProps {
  shift: Shift; pile: Pile; masterData: MasterData; fleetSetup: FleetSetup
  manpower: readonly ManpowerAssignment[]; checkerPersonId?: string; pendingBatches: readonly PendingBatchCarryOver[]
  registration?: PileRegistrationDraft; registrations?: readonly PileRegistrationDraft[]
  allPileRegistrations?: readonly PileRegistrationDraft[]; targetPosition?: BatchPosition
  store: ProductionRecordStore; generateTransactionId?: HaulageTransactionIdGenerator; now?: () => Date
  onFleetUpdated?: () => void; onPileRegistrationsUpdated?: (registrations: readonly PileRegistrationDraft[]) => Promise<boolean>
  onRecorded?: () => void; onClose?: () => void; showPileContext?: boolean
}
type LoadPhase = { kind: 'loading' } | { kind: 'error'; code: string } | { kind: 'loaded'; records: readonly ProductionRecord[] }

/** Pile context → Batch → Truck → Fleet → INCR flow → Remark → Save. */
export function ProductionRecordEntry(props: ProductionRecordEntryProps) {
  const { shift, pile, masterData, fleetSetup, manpower, checkerPersonId, pendingBatches, registration, registrations, allPileRegistrations, targetPosition, store, generateTransactionId = defaultGenerateHaulageTransactionId, now = () => new Date(), onFleetUpdated, onPileRegistrationsUpdated, onRecorded, onClose, showPileContext = true } = props
  const navigate = useNavigate()
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [activeFleetSetup, setActiveFleetSetup] = useState(fleetSetup)
  const [selectedBatch, setSelectedBatch] = useState(registration ? String(Number(registration.batch)) : '')
  const [selectedSuccessorBatch, setSelectedSuccessorBatch] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [truckQuery, setTruckQuery] = useState('')
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [fleetOpen, setFleetOpen] = useState(false)
  const [condition, setCondition] = useState<PhysicalCondition | ''>('')
  const [contamination, setContamination] = useState<Contamination | ''>('')
  const [disposition, setDisposition] = useState<Disposition>('ACCEPT')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [quickTruckId, setQuickTruckId] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const submitting = useRef(false)
  const registered = useMemo(() => registrations ?? (registration ? [registration] : []), [registrations, registration])

  useEffect(() => setActiveFleetSetup(fleetSetup), [fleetSetup])
  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })
    void store.listProductionRecordsForShiftPile(shift.id, pile.id).then((result) => {
      if (!cancelled) setPhase(result.ok ? { kind: 'loaded', records: result.value } : { kind: 'error', code: result.error.code })
    })
    return () => { cancelled = true }
  }, [store, shift.id, pile.id])

  const batches = useMemo(() => phase.kind === 'loaded' ? deriveOperationalBatchStates(masterData, pile, phase.records, registered) : undefined, [phase, masterData, pile, registered])
  const endpoints = useMemo(() => batches?.ok ? batches.value.filter((batch) => batch.operationalStatus === 'DIRECT_ACTIVE' || batch.operationalStatus === 'NEEDS_CONTINUATION').map((batch) => ({ ...batch, batch: batch.registration.batch })) : [], [batches])
  useEffect(() => { if (!registration && endpoints.length === 1 && !selectedBatch) setSelectedBatch(String(endpoints[0]!.batchNumber)) }, [registration, endpoints, selectedBatch])
  const endpoint = endpoints.find((candidate) => candidate.batchNumber === Number(selectedBatch))
  const successor = useMemo(() => {
    if (endpoint?.operationalStatus !== 'NEEDS_CONTINUATION' || !selectedSuccessorBatch) return undefined
    const batch = parseBatchNumber(Number(selectedSuccessorBatch)); const rit = parseRitNumber(1)
    if (!batch.ok || !rit.ok || Number(batch.value) === endpoint.batchNumber) return undefined
    return registered.find((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(batch.value)) ?? { pileId: pile.id, oreCode: pile.oreCode, batch: batch.value, rit: rit.value, status: 'ACTIVE' as const, continuationFromBatch: endpoint.registration.batch }
  }, [endpoint, selectedSuccessorBatch, registered, pile])
  const selectedRegistration = useMemo(() => endpoint?.operationalStatus === 'NEEDS_CONTINUATION' ? successor && { ...successor, continuationFromBatch: endpoint.registration.batch } : endpoint?.registration, [endpoint, successor])
  const targetStillMissed = useMemo(() => {
    if (!targetPosition || phase.kind !== 'loaded') return true
    const config = findOreSamplingConfig(masterData, pile.oreCode)
    if (!config) return false
    const expected = deriveExpectedRitsForBatch(pile, config.batchSize, pendingBatches, targetPosition.batchNumber, pile.freshPileStartPosition)
    return expected.ok && deriveMissedRits(phase.records, pile.id, targetPosition.batchNumber, expected.value).some((rit) => Number(rit) === Number(targetPosition.ritNumber))
  }, [targetPosition, phase, masterData, pile, pendingBatches])
  const nextPosition = useMemo(() => {
    if (targetPosition) return targetStillMissed ? targetPosition : undefined
    if (phase.kind !== 'loaded' || !selectedRegistration) return undefined
    const result = nextPositionForRegistration(masterData, pile, phase.records, selectedRegistration)
    return result.ok ? result.value : undefined
  }, [targetPosition, targetStillMissed, phase, selectedRegistration, masterData, pile])
  const currentPosition = useMemo(() => selectedRegistration && phase.kind === 'loaded' ? currentPositionForRegistration(phase.records, selectedRegistration) : undefined, [phase, selectedRegistration])

  const truckResult = useMemo(() => operationalTruckOptionsForDestinationPile(masterData, activeFleetSetup, pile.id), [masterData, activeFleetSetup, pile.id])
  const truckIds = truckResult.ok ? truckResult.value.map(String) : []
  const truckOptions = truckIds.filter((truck) => truck.toLowerCase().includes(truckQuery.trim().toLowerCase()))
  const fleetResult = useMemo(() => selectedTruckId ? operationalFleetOptionsForDestinationPileTruck(masterData, activeFleetSetup, pile.id, selectedTruckId) : undefined, [masterData, activeFleetSetup, pile.id, selectedTruckId])
  const fleetOptions = useMemo(() => fleetResult?.ok ? fleetResult.value : [], [fleetResult])
  const selectedFleet = fleetOptions.find((option) => String(option.fleetId) === selectedFleetId)
  const checker = useMemo(() => resolveProductionRecorder(manpower, checkerPersonId), [checkerPersonId, manpower])
  const samplingPreview = useMemo(() => nextPosition ? previewNextSampling(pile, masterData, nextPosition) : undefined, [pile, masterData, nextPosition])
  const samplingEvaluation = samplingPreview?.ok ? samplingPreview.value.samplingEvaluation : undefined
  const incrementRequired = samplingEvaluation?.sampleRequired === true
  const observationsRequired = incrementRequired || disposition === 'REJECT'
  const canSave = Boolean(selectedRegistration && selectedTruckId && selectedFleet && nextPosition && (!observationsRequired || (condition && contamination)) && checker.ok && !saving)
  const selectedTheme = pile.oreCode === 'SAP' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800 bg-amber-800 text-white'

  useEffect(() => {
    if (!selectedTruckId) { if (selectedFleetId) setSelectedFleetId(''); return }
    const stillEligible = fleetOptions.some((option) => String(option.fleetId) === selectedFleetId)
    if (fleetOptions.length === 1 && !stillEligible) setSelectedFleetId(String(fleetOptions[0]!.fleetId))
    else if (!stillEligible && selectedFleetId) setSelectedFleetId('')
  }, [selectedTruckId, selectedFleetId, fleetOptions])
  useEffect(() => { if (!observationsRequired) { setCondition(''); setContamination('') } }, [observationsRequired])

  function chooseTruck(truckId: string) { setSelectedTruckId(truckId); setTruckQuery(truckId); setSelectedFleetId(''); setFleetOpen(false); setError('') }
  function chooseDisposition(value: Disposition) { setDisposition(value); setConfirmingReject(false); if (!incrementRequired && value === 'ACCEPT') { setCondition(''); setContamination('') } }
  function fleetLabel(option: OperationalFleetOption) { const front = activeFleetSetup.fronts.find((candidate) => candidate.frontId === option.frontId); return `${String(option.frontId)} · ${option.haulerCode} · ${displayExcaCode(front?.excaCode)}` }

  async function saveQuickTruck() {
    if (!selectedFleet || !quickTruckId || !store.updateActiveFrontFleet) return
    setQuickSaving(true); setError('')
    const existing = selectedFleet.effectiveTruckIds.map(String)
    const adjusted = adjustFrontFleet({ fleetSetup: activeFleetSetup, masterData, frontId: String(selectedFleet.frontId), truckIds: [...existing, quickTruckId] })
    if (!adjusted.ok) { setError(adjusted.error.code); setQuickSaving(false); return }
    const saved = await store.updateActiveFrontFleet(shift.id, adjusted.value.fleetSetup)
    setQuickSaving(false)
    if (!saved.ok) { setError(saved.error.code); return }
    setActiveFleetSetup(adjusted.value.fleetSetup); setSelectedTruckId(quickTruckId); setTruckQuery(quickTruckId); setQuickOpen(false); setQuickQuery(''); setQuickTruckId(''); onFleetUpdated?.()
  }
  async function persistRegistration(): Promise<boolean> {
    if (!selectedRegistration) return false
    const source = allPileRegistrations ?? registered
    if (endpoint?.operationalStatus === 'NEEDS_CONTINUATION') {
      if (!successor) { setError('CONTINUATION_PERSISTENCE_UNAVAILABLE'); return false }
      const existing = source.find((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(successor.batch))
      if (existing?.status === 'INACTIVE') { setError('SUCCESSOR_BATCH_INACTIVE'); return false }
      if (existing && phase.kind === 'loaded' && hasEffectiveProductionForRegistration(phase.records, existing)) { setError('SUCCESSOR_ALREADY_STARTED'); return false }
      if (existing?.continuationFromBatch !== undefined && Number(existing.continuationFromBatch) !== Number(endpoint.registration.batch)) { setError('SUCCESSOR_ALREADY_LINKED'); return false }
      const next = existing ? source.map((candidate) => candidate === existing ? { ...existing, continuationFromBatch: endpoint.registration.batch } : candidate) : [...source, { ...successor, continuationFromBatch: endpoint.registration.batch }]
      const saved = onPileRegistrationsUpdated ? await onPileRegistrationsUpdated(next) : store.updatePileRegistrations ? (await store.updatePileRegistrations(shift.id, next)).ok : false
      if (!saved) setError('PILE_REGISTRATION_SAVE_FAILED'); else onFleetUpdated?.()
      return saved
    }
    if (endpoint?.operationalStatus === 'DIRECT_ACTIVE' && !source.some((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(selectedRegistration.batch))) {
      const saved = onPileRegistrationsUpdated ? await onPileRegistrationsUpdated([...source, selectedRegistration]) : store.updatePileRegistrations ? (await store.updatePileRegistrations(shift.id, [...source, selectedRegistration])).ok : false
      if (!saved) { setError('PILE_REGISTRATION_SAVE_FAILED'); return false }
      onFleetUpdated?.()
    }
    return true
  }
  async function handleSave() {
    if (!canSave || !selectedFleet || !nextPosition || !checker.ok || submitting.current) return
    submitting.current = true; setSaving(true); setError('')
    try {
      const built = recordProduction({ generatedTransactionId: generateTransactionId(), shift, pile, nextPosition, selectedFleetId: String(selectedFleet.fleetId), selectedTruckId, masterData, fleetSetup: activeFleetSetup, physicalCondition: condition || null, contamination: contamination || null, disposition, remark, createdAt: now(), createdBy: checker.value })
      if (!built.ok) { setError(built.error.code); return }
      if (!await persistRegistration()) return
      const saved = await store.addProductionTransaction(built.value)
      if (!saved.ok) { setError(saved.error.code); return }
      setPhase((current) => current.kind === 'loaded' ? { kind: 'loaded', records: [...current.records, built.value.productionRecord] } : current)
      setSelectedTruckId(''); setTruckQuery(''); setSelectedFleetId(''); setCondition(''); setContamination(''); setDisposition('ACCEPT'); setRemark(''); onRecorded?.()
    } finally { submitting.current = false; setSaving(false) }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (canSave) { if (disposition === 'REJECT') setConfirmingReject(true); else void handleSave() } }
  if (phase.kind === 'loading') return <div className="px-5 py-4 text-sm text-muted-foreground">Loading Production…</div>
  if (phase.kind === 'error') return <div className="px-5 py-4" role="alert">Unable to load Production records.</div>

  const optionClass = (active: boolean) => cn('h-10 rounded border text-sm font-semibold', active ? selectedTheme : 'border-border')
  return <div className="flex min-h-0 flex-col gap-3 px-5 py-4">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Select Pile_Id</p><strong>{pile.id}</strong></div>{showPileContext ? <Button type="button" size="sm" variant="secondary" onClick={() => onClose ? onClose() : navigate('/production')}>Close</Button> : <span className="text-xs text-muted-foreground">{findPileArea(masterData, pile.id)?.stockpileCode ?? '—'} · {pile.oreCode}</span>}</div>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <section><p className="mb-2 text-sm font-semibold">Select Batch</p><div className="grid gap-2">{endpoints.map((candidate) => <button key={candidate.batchNumber} type="button" onClick={() => { setSelectedBatch(String(candidate.batchNumber)); setSelectedSuccessorBatch(''); setError('') }} className={cn('rounded-lg border px-3 py-2 text-left text-sm font-semibold', candidate.batchNumber === endpoint?.batchNumber ? selectedTheme : 'border-border')}>Batch {formatBatchCode(candidate.batchNumber)} · {candidate.operationalStatus === 'NEEDS_CONTINUATION' ? 'Complete' : `Current Trip ${formatTripWithinBatch(candidate.currentTripWithinBatch)}`}</button>)}</div></section>
      {endpoint?.operationalStatus === 'NEEDS_CONTINUATION' ? <label className="flex flex-col gap-1 text-sm font-semibold">Select Next Batch<input aria-label="Select Next Batch" inputMode="numeric" value={selectedSuccessorBatch} onChange={(event) => setSelectedSuccessorBatch(event.target.value)} placeholder="Batch number" className="h-11 rounded-lg border border-input bg-background px-3" /></label> : null}
      {selectedRegistration ? <div className="rounded bg-muted px-3 py-2 text-sm"><p>Current: <strong>Batch {formatBatchCode(Number(currentPosition?.batch ?? selectedRegistration.batch))} · Trip {formatTripWithinBatch(Number(currentPosition?.trip ?? selectedRegistration.rit))}</strong></p><p className="mt-1">Next: <strong>Batch {formatBatchCode(Number(nextPosition?.batchNumber ?? currentPosition?.batch ?? selectedRegistration.batch))} · Trip {formatTripWithinBatch(Number(nextPosition?.ritNumber ?? currentPosition?.trip ?? selectedRegistration.rit))}</strong></p></div> : null}
      {targetPosition && !targetStillMissed ? <p role="alert" className="text-sm text-red-700">This position is no longer missed.</p> : null}
      <section className="min-w-0 text-sm font-semibold"><p className="mb-1">Select Truck</p><div className="relative"><input aria-label="Search Truck" value={truckQuery} onChange={(event) => { setTruckQuery(event.target.value); setSelectedTruckId(''); setSelectedFleetId(''); setError('') }} placeholder="Select Truck..." disabled={!selectedRegistration} className="h-11 w-full rounded-lg border border-input bg-input px-3 text-foreground focus:border-focus-accent focus:bg-input-focus focus:outline-none focus:ring-2 focus:ring-focus-accent/60 disabled:bg-disabled disabled:opacity-100" />{truckQuery.trim() ? <div role="listbox" aria-label="Truck options" className="absolute bottom-[calc(100%+0.25rem)] z-20 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-surface-elevated p-1 text-foreground shadow-lg">{truckOptions.map((truck) => <button key={truck} type="button" role="option" aria-selected={selectedTruckId === truck} onClick={() => chooseTruck(truck)} className={cn('block w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted', selectedTruckId === truck && 'bg-selected')}>{truck}</button>)}{truckOptions.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No active Fleet truck found.</p> : null}</div> : null}</div></section>
      <section className="min-w-0 text-sm font-semibold"><p className="mb-1">Select Fleet</p><div className="relative"><button type="button" aria-label="Select Fleet" aria-expanded={fleetOpen} disabled={!selectedTruckId || !selectedRegistration || fleetOptions.length <= 1} onClick={() => setFleetOpen((open) => !open)} className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-input px-3 text-left font-normal disabled:bg-disabled"><span className="truncate">{selectedFleet ? fleetLabel(selectedFleet) : selectedTruckId && fleetOptions.length === 1 ? 'Selecting Fleet…' : 'Select Fleet'}</span><span aria-hidden="true">⌄</span></button>{fleetOpen ? <div role="listbox" aria-label="Fleet options" className="absolute bottom-[calc(100%+0.25rem)] z-20 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-surface-elevated p-1 text-foreground shadow-lg">{fleetOptions.map((option) => <button key={String(option.fleetId)} type="button" role="option" aria-selected={String(option.fleetId) === selectedFleetId} onClick={() => { setSelectedFleetId(String(option.fleetId)); setFleetOpen(false) }} className={cn('block w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted', String(option.fleetId) === selectedFleetId && 'bg-selected')}>{fleetLabel(option)}</button>)}</div> : null}</div></section>
      {selectedFleet ? <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Front: <strong>{selectedFleet.frontId}</strong></span><Button type="button" variant="secondary" size="sm" onClick={() => setQuickOpen(true)}>+ Truck</Button></div> : null}
      {nextPosition ? <p className={cn('rounded px-3 py-2 text-sm font-semibold', incrementRequired ? 'bg-focus-accent-soft text-foreground' : 'bg-muted text-muted-foreground')}>INCR: {samplingEvaluation?.sampleRequired ? `YES · ${Number(samplingEvaluation.incrementNumber)}` : 'NO'}</p> : null}
      {!incrementRequired ? <Choice label="Disposition" values={DISPOSITIONS} selected={disposition} onSelect={chooseDisposition} optionClass={optionClass} /> : null}
      {observationsRequired ? <><Choice label="Condition" values={PHYSICAL_CONDITIONS} selected={condition} onSelect={setCondition} optionClass={optionClass} /><Choice label="Contam." values={CONTAMINATIONS} selected={contamination} onSelect={setContamination} optionClass={optionClass} /></> : null}
      {incrementRequired ? <Choice label="Disposition" values={DISPOSITIONS} selected={disposition} onSelect={chooseDisposition} optionClass={optionClass} /> : null}
      <label className="flex flex-col gap-1 text-sm font-semibold">Remark<textarea value={remark} onChange={(event) => setRemark(event.target.value)} rows={2} className="rounded-lg border border-input px-3 py-2" /></label>
      {!checker.ok ? <p role="alert" className="text-sm text-red-700">{checker.error.code}</p> : null}{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" size="lg" onClick={() => onClose ? onClose() : navigate('/production')}>Cancel</Button><Button type="submit" size="lg" disabled={!canSave}>{saving ? 'Saving…' : 'Record Production'}</Button></div>
    </form>
    {confirmingReject ? <div role="dialog" aria-modal="true" aria-label="Confirm Reject" className="fixed inset-0 z-40 flex items-end bg-black/30"><Card className="w-full rounded-b-none"><CardContent className="flex flex-col gap-3"><h2 className="type-dialog-title">Confirm Reject</h2><p className="text-sm text-muted-foreground">This Production record will be saved with the Reject disposition.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setConfirmingReject(false)}>Cancel</Button><Button type="button" className="bg-red-700 text-white hover:bg-red-800" disabled={saving} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Confirm Reject'}</Button></div></CardContent></Card></div> : null}
    {quickOpen ? <QuickAddTruck query={quickQuery} selectedTruckId={quickTruckId} trucks={masterData.trucks.filter((truck) => selectedFleet && truck.haulerCode === selectedFleet.haulerCode && !selectedFleet.effectiveTruckIds.map(String).includes(String(truck.id)) && (quickQuery.trim() === '' || String(truck.id).toLowerCase().includes(quickQuery.trim().toLowerCase())))} saving={quickSaving} canSave={Boolean(store.updateActiveFrontFleet)} onQuery={setQuickQuery} onSelect={setQuickTruckId} onClose={() => setQuickOpen(false)} onSave={() => void saveQuickTruck()} /> : null}
  </div>
}

function Choice<T extends string>({ label, values, selected, onSelect, optionClass }: { label: string; values: readonly T[]; selected: T | ''; onSelect: (value: T) => void; optionClass: (active: boolean) => string }) {
  return <fieldset><legend className="mb-1 text-sm font-semibold">{label}</legend><div className="grid grid-cols-2 gap-2">{values.map((value) => <button key={value} type="button" aria-pressed={selected === value} onClick={() => onSelect(value)} className={optionClass(selected === value)}>{value}</button>)}</div></fieldset>
}
function QuickAddTruck({ query, selectedTruckId, trucks, saving, canSave, onQuery, onSelect, onClose, onSave }: { query: string; selectedTruckId: string; trucks: readonly { id: unknown }[]; saving: boolean; canSave: boolean; onQuery: (value: string) => void; onSelect: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label="Quick Add Truck" className="fixed inset-0 z-40 flex items-end bg-black/30"><Card className="w-full rounded-b-none"><CardContent className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="type-dialog-title">Quick Add Truck</h2><Button type="button" size="sm" variant="secondary" onClick={onClose}>Close</Button></div><input aria-label="Quick Add Truck search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search company Truck..." className="h-11 rounded-lg border border-input bg-input px-3 text-foreground" /><div className="max-h-48 overflow-y-auto rounded border border-border">{trucks.map((truck) => <button key={String(truck.id)} type="button" onClick={() => onSelect(String(truck.id))} className={cn('block w-full px-3 py-2 text-left text-sm', selectedTruckId === String(truck.id) && 'bg-focus-accent-soft')}>{String(truck.id)}</button>)}</div><Button type="button" disabled={!selectedTruckId || saving || !canSave} onClick={onSave}>{saving ? 'Adding…' : 'Add to Fleet'}</Button></CardContent></Card></div>
}
