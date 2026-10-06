import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { adjustFrontFleet } from '@/application/fleet-setup/adjust-front-fleet'
import { deriveExpectedRitsForBatch } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { generateHaulageTransactionId as defaultGenerateHaulageTransactionId, type HaulageTransactionIdGenerator } from '@/application/haulage-operation/haulage-id-generator'
import { operationalFleetOptionsForDestinationPile, type OperationalFleetOption } from '@/application/haulage-operation/operational-fleet-options'
import { deriveMissedRits } from '@/application/production/missed-rit'
import { currentPositionForRegistration, deriveOperationalBatchStates, formatBatchCode, formatTripWithinBatch, hasEffectiveProductionForRegistration, nextPositionForRegistration } from '@/application/production/production-record-presentation'
import type { ProductionRecordStore } from '@/application/production/production-record-store'
import { recordProduction } from '@/application/production/record-production'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { displayExcaCode } from '@/domain/fleet/exca-code'
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
  shift: Shift
  pile: Pile
  masterData: MasterData
  fleetSetup: FleetSetup
  manpower: readonly ManpowerAssignment[]
  pendingBatches: readonly PendingBatchCarryOver[]
  /** Direct-route compatibility: one preselected active registration. */
  registration?: PileRegistrationDraft
  /** Record workspace uses this list to make the Batch selection explicit. */
  registrations?: readonly PileRegistrationDraft[]
  /** Full workspace rows are needed to persist an explicit successor link. */
  allPileRegistrations?: readonly PileRegistrationDraft[]
  targetPosition?: BatchPosition
  store: ProductionRecordStore
  generateTransactionId?: HaulageTransactionIdGenerator
  now?: () => Date
  onFleetUpdated?: () => void
  onPileRegistrationsUpdated?: (registrations: readonly PileRegistrationDraft[]) => Promise<boolean>
  onRecorded?: () => void
  onClose?: () => void
  /** The Record workspace already renders the selected Pile context. */
  showPileContext?: boolean
}

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'loaded'; readonly records: readonly ProductionRecord[] }

/** Production entry order is Pile context, Batch, Fleet, Truck, then observation fields. */
export function ProductionRecordEntry({
  shift, pile, masterData, fleetSetup, manpower, pendingBatches, registration, registrations, allPileRegistrations,
  targetPosition, store, generateTransactionId = defaultGenerateHaulageTransactionId,
  now = () => new Date(), onFleetUpdated, onPileRegistrationsUpdated, onRecorded, onClose, showPileContext = true,
}: ProductionRecordEntryProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [activeFleetSetup, setActiveFleetSetup] = useState(fleetSetup)
  const registeredRegistrations = useMemo(
    () => registrations ?? (registration ? [registration] : []),
    [registrations, registration],
  )
  const [selectedBatch, setSelectedBatch] = useState(registration ? String(Number(registration.batch)) : '')
  const [selectedSuccessorBatch, setSelectedSuccessorBatch] = useState('')
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [fleetOpen, setFleetOpen] = useState(false)
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [truckQuery, setTruckQuery] = useState('')
  const [condition, setCondition] = useState<PhysicalCondition | ''>('')
  const [contamination, setContamination] = useState<Contamination | ''>('')
  const [disposition, setDisposition] = useState<Disposition>('ACCEPT')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [quickTruckId, setQuickTruckId] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [confirmingReject, setConfirmingReject] = useState(false)
  const submitting = useRef(false)

  useEffect(() => setActiveFleetSetup(fleetSetup), [fleetSetup])
  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })
    void store.listProductionRecordsForShiftPile(shift.id, pile.id).then((result) => {
      if (!cancelled) setPhase(result.ok ? { kind: 'loaded', records: result.value } : { kind: 'error', code: result.error.code })
    })
    return () => { cancelled = true }
  }, [store, shift.id, pile.id])

  const operationalBatches = useMemo(() => phase.kind === 'loaded'
    ? deriveOperationalBatchStates(masterData, pile, phase.records, registeredRegistrations)
    : undefined, [phase, masterData, pile, registeredRegistrations])
  const availableEndpoints = useMemo(() => operationalBatches?.ok
    ? operationalBatches.value
      .filter((batch) => batch.operationalStatus === 'DIRECT_ACTIVE' || batch.operationalStatus === 'NEEDS_CONTINUATION')
      .map((batch) => ({ ...batch, batch: batch.registration.batch }))
    : [], [operationalBatches])
  useEffect(() => {
    if (!registration && availableEndpoints.length === 1 && !selectedBatch) {
      setSelectedBatch(String(availableEndpoints[0]!.batchNumber))
    }
  }, [registration, availableEndpoints, selectedBatch])
  const selectedEndpoint = availableEndpoints.find((candidate) => candidate.batchNumber === Number(selectedBatch))
  const selectedSuccessor = useMemo(() => {
    if (selectedEndpoint?.operationalStatus !== 'NEEDS_CONTINUATION' || !selectedSuccessorBatch) return undefined
    const parsedBatch = parseBatchNumber(Number(selectedSuccessorBatch))
    const seedRit = parseRitNumber(1)
    if (!parsedBatch.ok || !seedRit.ok) return undefined
    if (Number(parsedBatch.value) === selectedEndpoint.batchNumber) return undefined
    return registeredRegistrations.find((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(parsedBatch.value))
      ?? {
        pileId: pile.id,
        oreCode: pile.oreCode,
        batch: parsedBatch.value,
        rit: seedRit.value,
        status: 'ACTIVE' as const,
        continuationFromBatch: selectedEndpoint.registration.batch,
      }
  }, [selectedEndpoint, selectedSuccessorBatch, registeredRegistrations, pile])
  const selectedRegistration = useMemo(() => selectedEndpoint?.operationalStatus === 'NEEDS_CONTINUATION'
    ? selectedSuccessor && { ...selectedSuccessor, continuationFromBatch: selectedEndpoint.registration.batch }
    : selectedEndpoint?.registration, [selectedEndpoint, selectedSuccessor])
  const fleetOptionsResult = useMemo(() => operationalFleetOptionsForDestinationPile(masterData, activeFleetSetup, pile.id), [masterData, activeFleetSetup, pile.id])
  const fleetOptions = fleetOptionsResult.ok ? fleetOptionsResult.value : []
  const selectedFleet = fleetOptions.find((candidate) => (candidate.fleetId as string) === selectedFleetId)
  const checker = useMemo(() => resolveProductionRecorder(manpower), [manpower])
  const targetStillMissed = useMemo(() => {
    if (!targetPosition || phase.kind !== 'loaded') return true
    const config = findOreSamplingConfig(masterData, pile.oreCode)
    if (!config) return false
    const expected = deriveExpectedRitsForBatch(pile, config.batchSize, pendingBatches, targetPosition.batchNumber, pile.freshPileStartPosition)
    return expected.ok && deriveMissedRits(phase.records, pile.id, targetPosition.batchNumber, expected.value).some((trip) => Number(trip) === Number(targetPosition.ritNumber))
  }, [targetPosition, phase, masterData, pile, pendingBatches])
  const nextPosition = useMemo(() => {
    if (targetPosition) return targetStillMissed ? targetPosition : undefined
    if (phase.kind !== 'loaded' || !selectedRegistration) return undefined
    const next = nextPositionForRegistration(masterData, pile, phase.records, selectedRegistration)
    return next.ok ? next.value : undefined
  }, [targetPosition, targetStillMissed, phase, selectedRegistration, masterData, pile])
  const currentPosition = useMemo(() => selectedRegistration && phase.kind === 'loaded' ? currentPositionForRegistration(phase.records, selectedRegistration) : undefined, [phase, selectedRegistration])
  const fleetTruckIds = selectedFleet?.effectiveTruckIds.map((truck) => truck as string) ?? []
  const normalTruckOptions = fleetTruckIds.filter((truck) => truck.toLowerCase().includes(truckQuery.trim().toLowerCase()))
  const quickCandidates = selectedFleet
    ? masterData.trucks.filter((truck) => truck.haulerCode === selectedFleet.haulerCode && !fleetTruckIds.includes(truck.id as string) && (quickQuery.trim() === '' || (truck.id as string).toLowerCase().includes(quickQuery.trim().toLowerCase())))
    : []
  const canSave = Boolean(selectedRegistration && selectedFleet && selectedTruckId && nextPosition && condition && contamination && checker.ok && !saving)
  const sapTheme = pile.oreCode === 'SAP'
  const selectedTheme = sapTheme ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800 bg-amber-800 text-white'

  function chooseBatch(batch: string) {
    setSelectedBatch(batch); setSelectedSuccessorBatch(''); setSelectedFleetId(''); setSelectedTruckId(''); setTruckQuery(''); setError('')
  }
  function chooseFleet(fleetId: string) {
    setSelectedFleetId(fleetId); setFleetOpen(false); setSelectedTruckId(''); setTruckQuery(''); setError('')
  }
  async function saveQuickTruck() {
    if (!selectedFleet || !quickTruckId || !store.updateActiveFrontFleet) return
    setQuickSaving(true); setError('')
    const adjusted = adjustFrontFleet({
      fleetSetup: activeFleetSetup, masterData, frontId: selectedFleet.frontId as string,
      truckIds: [...fleetTruckIds, quickTruckId],
    })
    if (!adjusted.ok) { setError(adjusted.error.code); setQuickSaving(false); return }
    const saved = await store.updateActiveFrontFleet(shift.id, adjusted.value.fleetSetup)
    setQuickSaving(false)
    if (!saved.ok) { setError(saved.error.code); return }
    setActiveFleetSetup(adjusted.value.fleetSetup)
    setSelectedTruckId(quickTruckId)
    setQuickOpen(false); setQuickQuery(''); setQuickTruckId('')
    onFleetUpdated?.()
  }
  async function handleSave() {
    if (!canSave || !selectedRegistration || !selectedFleet || !nextPosition || !condition || !contamination || !checker.ok || submitting.current) return
    submitting.current = true; setSaving(true); setError('')
    try {
      if (selectedEndpoint?.operationalStatus === 'NEEDS_CONTINUATION') {
        if (!selectedSuccessor) {
          setError('CONTINUATION_PERSISTENCE_UNAVAILABLE')
          return
        }
        const source = allPileRegistrations ?? registeredRegistrations
        const existing = source.find((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(selectedSuccessor.batch))
        if (existing?.status === 'INACTIVE') {
          setError('SUCCESSOR_BATCH_INACTIVE')
          return
        }
        if (existing && phase.kind === 'loaded' && hasEffectiveProductionForRegistration(phase.records, existing)) {
          setError('SUCCESSOR_ALREADY_STARTED')
          return
        }
        if (existing?.continuationFromBatch !== undefined && Number(existing.continuationFromBatch) !== Number(selectedEndpoint.registration.batch)) {
          setError('SUCCESSOR_ALREADY_LINKED')
          return
        }
        const successor: PileRegistrationDraft = {
          ...(existing ?? selectedSuccessor),
          continuationFromBatch: selectedEndpoint.registration.batch,
        }
        const nextRegistrations = existing
          ? source.map((candidate) => candidate === existing ? successor : candidate)
          : [...source, successor]
        const persisted = onPileRegistrationsUpdated
          ? await onPileRegistrationsUpdated(nextRegistrations)
          : store.updatePileRegistrations
            ? (await store.updatePileRegistrations(shift.id, nextRegistrations)).ok
            : false
        if (!persisted) {
          setError('PILE_REGISTRATION_SAVE_FAILED')
          return
        }
        onFleetUpdated?.()
      }
      if (selectedEndpoint?.operationalStatus === 'DIRECT_ACTIVE') {
        const source = allPileRegistrations ?? registeredRegistrations
        const exists = source.some((candidate) => candidate.pileId === pile.id && Number(candidate.batch) === Number(selectedRegistration.batch))
        if (!exists) {
          const persisted = onPileRegistrationsUpdated
            ? await onPileRegistrationsUpdated([...source, selectedRegistration])
            : store.updatePileRegistrations
              ? (await store.updatePileRegistrations(shift.id, [...source, selectedRegistration])).ok
              : false
          if (!persisted) {
            setError('PILE_REGISTRATION_SAVE_FAILED')
            return
          }
          onFleetUpdated?.()
        }
      }
      const built = recordProduction({
        generatedTransactionId: generateTransactionId(), shift, pile, nextPosition,
        selectedFleetId: selectedFleet.fleetId as string, selectedTruckId, masterData, fleetSetup: activeFleetSetup,
        physicalCondition: condition, contamination, disposition, remark, createdAt: now(), createdBy: checker.value,
      })
      if (!built.ok) { setError(built.error.code); return }
      const saved = await store.addProductionTransaction(built.value)
      if (!saved.ok) { setError(saved.error.code); return }
      setPhase((current) => current.kind === 'loaded' ? { kind: 'loaded', records: [...current.records, built.value.productionRecord] } : current)
      setSelectedTruckId(''); setTruckQuery(''); setCondition(''); setContamination(''); setDisposition('ACCEPT'); setRemark('')
      onRecorded?.()
    } finally { submitting.current = false; setSaving(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    if (disposition === 'REJECT') { setConfirmingReject(true); return }
    void handleSave()
  }
  function fleetLabel(option: OperationalFleetOption): string {
    const front = activeFleetSetup.fronts.find((candidate) => candidate.frontId === option.frontId)
    return (option.frontId as string) + ' · ' + option.haulerCode + ' · ' + displayExcaCode(front?.excaCode)
  }

  if (phase.kind === 'loading') return <div className="px-5 py-4 text-sm text-muted-foreground">Loading Production…</div>
  if (phase.kind === 'error') return <div className="px-5 py-4" role="alert">Unable to load Production records.</div>

  return <div className="flex min-h-0 flex-col gap-3 px-5 py-4">
    {showPileContext ? <div className="flex items-center justify-between gap-3"><strong>{pile.id}</strong><Button type="button" size="sm" variant="secondary" onClick={() => onClose ? onClose() : navigate('/production')}>Close</Button></div> : null}
    {!showPileContext ? <div className="flex items-center justify-between gap-2 text-sm"><div className="flex min-w-0 items-baseline gap-2"><strong className="shrink-0 text-base">{pile.id}</strong>{nextPosition ? <strong className="truncate">Batch {formatBatchCode(Number(nextPosition.batchNumber))} / {formatTripWithinBatch(Number(nextPosition.ritNumber))}</strong> : null}</div><span className="shrink-0 text-xs text-muted-foreground">{findPileArea(masterData, pile.id)?.stockpileCode ?? '—'} <span className={cn('rounded px-1.5 py-0.5 font-semibold', sapTheme ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>{pile.oreCode}</span></span></div> : null}
    <form onSubmit={submit} className="flex flex-col gap-4">
      <section><p className="mb-2 text-sm font-semibold">Select Batch</p><div className="grid gap-2">{availableEndpoints.map((candidate) => {
        const current = { batch: candidate.batchNumber, trip: candidate.currentTripWithinBatch }
        const active = candidate.batchNumber === selectedEndpoint?.batchNumber
        if (candidate.operationalStatus === 'NEEDS_CONTINUATION') {
          return <button key={candidate.batchNumber} type="button" onClick={() => chooseBatch(String(candidate.batchNumber))} className={cn('rounded-lg border px-3 py-2 text-left text-sm font-semibold', active ? selectedTheme : 'border-border')}>Batch {formatBatchCode(candidate.batchNumber)} · Complete</button>
        }
        return <button key={Number(candidate.batch)} type="button" onClick={() => chooseBatch(String(Number(candidate.batch)))} className={cn('rounded-lg border px-3 py-2 text-left text-sm font-semibold', active ? selectedTheme : 'border-border')}>Batch {formatBatchCode(current.batch)} · Current Trip {formatTripWithinBatch(current.trip)}</button>
      })}</div></section>
      {selectedEndpoint?.operationalStatus === 'NEEDS_CONTINUATION' ? <label className="flex flex-col gap-1 text-sm font-semibold">Select Next Batch<input aria-label="Select Next Batch" inputMode="numeric" value={selectedSuccessorBatch} onChange={(event) => { setSelectedSuccessorBatch(event.target.value); setSelectedFleetId(''); setSelectedTruckId(''); setTruckQuery('') }} placeholder="Batch number" className="h-11 rounded-lg border border-input bg-background px-3" /></label> : null}
      {selectedRegistration ? <div className="rounded bg-muted px-3 py-2 text-sm"><p>Current: <strong>Batch {formatBatchCode(Number(currentPosition?.batch ?? selectedRegistration.batch))} · Trip {formatTripWithinBatch(Number(currentPosition?.trip ?? selectedRegistration.rit))}</strong></p><p className="mt-1">Next: <strong>Batch {formatBatchCode(Number(nextPosition?.batchNumber ?? currentPosition?.batch ?? selectedRegistration.batch))} · Trip {formatTripWithinBatch(Number(nextPosition?.ritNumber ?? currentPosition?.trip ?? selectedRegistration.rit))}</strong></p></div> : null}
      {targetPosition && !targetStillMissed ? <p role="alert" className="text-sm text-red-700">This position is no longer missed.</p> : null}
      <section className="min-w-0 text-sm font-semibold"><p className="mb-1">Select Fleet</p><div className="relative"><button type="button" aria-label="Select Fleet" aria-expanded={fleetOpen} disabled={!selectedRegistration} onClick={() => setFleetOpen((open) => !open)} className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-left font-normal disabled:opacity-50"><span className="truncate">{selectedFleet ? fleetLabel(selectedFleet) : 'Select Fleet'}</span><span aria-hidden="true">⌃</span></button>{fleetOpen ? <div role="listbox" aria-label="Fleet options" className="scrollbar-none absolute bottom-[calc(100%+0.25rem)] z-20 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">{fleetOptions.map((option) => <button key={option.fleetId as string} type="button" role="option" aria-selected={(option.fleetId as string) === selectedFleetId} onClick={() => chooseFleet(option.fleetId as string)} className={cn('block w-full rounded px-3 py-2 text-left text-sm font-normal', (option.fleetId as string) === selectedFleetId && 'bg-primary/10')}>{fleetLabel(option)}</button>)}</div> : null}</div></section>
      {selectedFleet ? <p className="text-sm text-muted-foreground">Front: <strong>{selectedFleet.frontId}</strong></p> : null}
      {selectedFleet ? <section><p className="mb-1 text-sm font-semibold">Truck</p><div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2"><Button type="button" variant="secondary" onClick={() => setQuickOpen(true)}>+ Truck</Button><div className="relative min-w-0"><input aria-label="Search Truck" value={truckQuery} onChange={(event) => { setTruckQuery(event.target.value); setSelectedTruckId('') }} placeholder="Select Truck..." className="h-11 w-full min-w-0 rounded-lg border border-input px-3" />{truckQuery.trim() ? <div role="listbox" aria-label="Truck options" className="absolute bottom-[calc(100%+0.25rem)] z-20 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">{normalTruckOptions.map((truck) => <button key={truck} type="button" role="option" aria-selected={selectedTruckId === truck} onClick={() => { setSelectedTruckId(truck); setTruckQuery(truck) }} className={cn('block w-full rounded px-3 py-2 text-left text-sm', selectedTruckId === truck && 'bg-primary/10')}>{truck}</button>)}{normalTruckOptions.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No Fleet truck found.</p> : null}</div> : null}</div></div></section> : null}
      <fieldset><legend className="mb-1 text-sm font-semibold">Condition</legend><div className="grid grid-cols-2 gap-2">{PHYSICAL_CONDITIONS.map((value) => <button key={value} type="button" aria-pressed={condition === value} onClick={() => setCondition(value)} className={cn('h-10 rounded border text-sm font-semibold', condition === value ? selectedTheme : 'border-border')}>{value}</button>)}</div></fieldset>
      <fieldset><legend className="mb-1 text-sm font-semibold">Contam.</legend><div className="grid grid-cols-2 gap-2">{CONTAMINATIONS.map((value) => <button key={value} type="button" aria-pressed={contamination === value} onClick={() => setContamination(value)} className={cn('h-10 rounded border text-sm font-semibold', contamination === value ? selectedTheme : 'border-border')}>{value}</button>)}</div></fieldset>
      <fieldset><legend className="mb-1 text-sm font-semibold">Disposition</legend><div className="grid grid-cols-2 gap-2">{DISPOSITIONS.map((value) => <button key={value} type="button" aria-pressed={disposition === value} onClick={() => { setDisposition(value); setConfirmingReject(false) }} className={cn('h-10 rounded border text-sm font-semibold', disposition === value ? selectedTheme : 'border-border')}>{value}</button>)}</div></fieldset>
      <label className="flex flex-col gap-1 text-sm font-semibold">Remark<textarea value={remark} onChange={(event) => setRemark(event.target.value)} rows={2} className="rounded-lg border border-input px-3 py-2" /></label>
      {!checker.ok ? <p role="alert" className="text-sm text-red-700">{checker.error.code}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {selectedFleet && selectedTruckId && nextPosition ? <p className="rounded bg-muted px-3 py-2 text-sm"><strong>{pile.id}</strong> · Batch {formatBatchCode(Number(nextPosition.batchNumber))}/{formatTripWithinBatch(Number(nextPosition.ritNumber))} · Front {selectedFleet.frontId} · Truck {selectedTruckId}</p> : null}
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" size="lg" onClick={() => onClose ? onClose() : navigate('/production')}>Cancel</Button><Button type="submit" size="lg" disabled={!canSave}>{saving ? 'Saving…' : 'Record Production'}</Button></div>
    </form>
    {confirmingReject ? <div role="dialog" aria-modal="true" aria-label="Confirm Reject" className="fixed inset-0 z-40 flex items-end bg-black/30"><Card className="w-full rounded-b-none"><CardContent className="flex flex-col gap-3"><h2 className="font-bold">Confirm Reject</h2><p className="text-sm text-muted-foreground">This Production record will be saved with the Reject disposition.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setConfirmingReject(false)}>Cancel</Button><Button type="button" className="bg-red-700 text-white hover:bg-red-800" disabled={saving} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Confirm Reject'}</Button></div></CardContent></Card></div> : null}
    {quickOpen ? <div role="dialog" aria-modal="true" aria-label="Quick Add Truck" className="fixed inset-0 z-40 flex items-end bg-black/30"><Card className="w-full rounded-b-none"><CardContent className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="font-bold">Quick Add Truck</h2><Button type="button" size="sm" variant="secondary" onClick={() => setQuickOpen(false)}>Close</Button></div><input aria-label="Quick Add Truck search" value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} placeholder="Search company Truck..." className="h-11 rounded-lg border border-input px-3" /><div className="max-h-48 overflow-y-auto rounded border border-border">{quickCandidates.map((truck) => <button key={truck.id} type="button" onClick={() => setQuickTruckId(truck.id as string)} className={cn('block w-full px-3 py-2 text-left text-sm', quickTruckId === (truck.id as string) && 'bg-primary/10')}>{truck.id}</button>)}{quickCandidates.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No eligible company Truck.</p> : null}</div><Button type="button" disabled={!quickTruckId || quickSaving || !store.updateActiveFrontFleet} onClick={() => void saveQuickTruck()}>{quickSaving ? 'Adding…' : 'Add to Fleet'}</Button></CardContent></Card></div> : null}
  </div>
}
