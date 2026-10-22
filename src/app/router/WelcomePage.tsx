import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Calendar, Check, ChevronRight, FileCheck2, FilePlus2, FileSearch, ShieldCheck, Truck, Users, X } from 'lucide-react'
import { localOperationalStore, type LocalShiftWorkspace } from '@/app/local-operational-store'
import { refreshAppsScriptMasterData } from '@/app/google/google-master-data-sync'
import { searchPersonnel, type PersonnelSearchResult } from '@/application/manpower/personnel-search'
import { createDefaultShiftRegistrationFormValues, type ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import { validateShiftRegistrationForm } from '@/application/shift-registration/validate-shift-registration-form'
import type { MasterData } from '@/domain/master/master-data'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'
import { CustomSelect } from '@/components/ui/custom-select'
import { cn } from '@/components/ui/cn'
import { readPreShiftSetupSession } from '@/infrastructure/device/pre-shift-setup-session-store'
import { loadLandingMasterData } from './landing-master-data'

type LandingModal = 'new' | 'resume' | undefined
type MasterDataStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'offline-first-use' }
  | { readonly kind: 'failed'; readonly code: string }

interface WorkIdentity {
  readonly values: ShiftRegistrationFormValues
  readonly checker?: PersonnelSearchResult
}

interface RecoverablePreShiftSetup {
  readonly shift?: unknown
  readonly outcome?: unknown
  readonly fleetDraft?: unknown
  readonly fleetSetup?: unknown
}

function recoverableSetupPath(): string | undefined {
  const setup = readPreShiftSetupSession<RecoverablePreShiftSetup>()
  if (!setup?.shift) return undefined
  if (setup.fleetSetup) return '/start/review'
  if (setup.fleetDraft) return '/start/fleet'
  if (setup.outcome) return '/start/piles'
  return '/start/source'
}

function isComplete(identity: WorkIdentity, masterData: MasterData | undefined): boolean {
  return !!masterData && !!identity.checker && validateShiftRegistrationForm(identity.values, masterData).valid
}

function IdentityDialog({
  title,
  identity,
  masterData,
  confirmLabel,
  confirmDisabled,
  children,
  onIdentityChange,
  onCancel,
  onConfirm,
}: {
  readonly title: string
  readonly identity: WorkIdentity
  readonly masterData?: MasterData
  readonly confirmLabel: string
  readonly confirmDisabled: boolean
  readonly children?: ReactNode
  readonly onIdentityChange: (identity: WorkIdentity) => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [checkerQuery, setCheckerQuery] = useState('')
  const [checkerListAbove, setCheckerListAbove] = useState(false)
  const [visualViewport, setVisualViewport] = useState<{ readonly top: number; readonly height: number }>()
  const candidates = useMemo(
    () => (masterData ? searchPersonnel(masterData, checkerQuery) : []),
    [checkerQuery, masterData],
  )
  const houses = useMemo(
    () => masterData?.samplingHouses.filter((house) => house.sectorCode === identity.values.sectorCode) ?? [],
    [identity.values.sectorCode, masterData],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('button, input, select')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')]
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => {
      setVisualViewport({
        top: viewport?.offsetTop ?? 0,
        height: viewport?.height ?? window.innerHeight,
      })
    }
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  function updateValues(next: Partial<ShiftRegistrationFormValues>) {
    const sectorChanged = next.sectorCode !== undefined && next.sectorCode !== identity.values.sectorCode
    onIdentityChange({
      ...identity,
      values: {
        ...identity.values,
        ...next,
        samplingHouseCode: sectorChanged ? '' : next.samplingHouseCode ?? identity.values.samplingHouseCode,
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-emerald-950/75" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="absolute inset-x-0 flex justify-center px-3" style={visualViewport ? { top: visualViewport.top, height: visualViewport.height } : undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="landing-identity-title" className="my-auto w-[calc(100vw-24px)] max-w-[430px] rounded-3xl border border-white/20 bg-emerald-950 p-3.5 text-white shadow-2xl">
        <header className="grid h-10 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 border-b border-white/15 pb-2">
          <span aria-hidden="true" />
          <h2 id="landing-identity-title" className="type-dialog-title min-w-0 text-center">{title}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-focus-accent"><X aria-hidden="true" /></button>
        </header>

        <div className="mt-3 grid gap-2.5">
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(4.5rem,3fr)] gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">Date
            <span className="relative flex h-10 items-center rounded-xl border border-white/25 bg-white px-3 text-sm text-emerald-950">
              <span>{formatShiftDateForDisplay(identity.values.shiftDate)}</span><Calendar className="ml-auto" size={18} aria-hidden="true" />
              <input type="date" aria-label="Date" value={identity.values.shiftDate} onChange={(event) => updateValues({ shiftDate: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">Shift
            <CustomSelect ariaLabel="Shift" value={identity.values.shiftCode} onChange={(shiftCode) => updateValues({ shiftCode })} placeholder="Select Shift" options={[{ value: 'D', label: 'D' }, { value: 'N', label: 'N' }]} className="h-10 rounded-xl border-white/25 text-sm text-emerald-950" />
          </label>
          </div>
          <div className="grid grid-cols-[minmax(0,11fr)_minmax(0,13fr)] gap-2 max-[340px]:grid-cols-1">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">Sector
            <CustomSelect ariaLabel="Sector" value={identity.values.sectorCode} onChange={(sectorCode) => updateValues({ sectorCode })} disabled={!masterData} placeholder="Select Sector" options={masterData?.sectors.map((sector) => ({ value: sector.code as string, label: sector.code as string })) ?? []} className="h-10 rounded-xl border-white/25 text-sm text-emerald-950 disabled:text-slate-500" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">Sampling House
            <CustomSelect ariaLabel="Sampling House" value={identity.values.samplingHouseCode} onChange={(samplingHouseCode) => updateValues({ samplingHouseCode })} disabled={!identity.values.sectorCode || !masterData} placeholder="Select Sampling House" options={houses.map((house) => ({ value: house.code as string, label: house.code as string }))} className="h-10 rounded-xl border-white/25 text-sm text-emerald-950 disabled:text-slate-500" />
          </label>
          </div>
        </div>

        <section className="mt-2.5 grid grid-cols-[minmax(0,1fr)_4.5rem] items-end gap-3">
          <div className="relative min-w-0">
          <label htmlFor="landing-checker-search" className="text-xs font-semibold">Checker</label>
          <input id="landing-checker-search" value={identity.checker ? identity.checker.name + ' - ' + identity.checker.personId : checkerQuery} onFocus={(event) => { const viewportBottom = window.visualViewport?.height ?? window.innerHeight; setCheckerListAbove(viewportBottom - event.currentTarget.getBoundingClientRect().bottom < 180) }} onChange={(event) => { setCheckerQuery(event.target.value); onIdentityChange({ ...identity, checker: undefined }) }} placeholder="Search / Select Checker" disabled={!masterData} className="landing-text-input mt-1 h-10 w-full rounded-xl border border-white/25 bg-white px-3 text-sm text-emerald-950 caret-emerald-950 placeholder:text-emerald-900/55 focus:border-focus-accent focus:outline-2 focus:outline-offset-2 focus:outline-focus-accent disabled:text-slate-500" />
          {checkerQuery.trim() && !identity.checker ? <div role="listbox" aria-label="Checker results" className={'absolute left-0 z-20 max-h-36 w-full overflow-y-auto rounded-xl border border-white/20 bg-white p-1 text-emerald-950 shadow-xl ' + (checkerListAbove ? 'bottom-full mb-1' : 'top-full mt-1')}>
            {candidates.map((candidate) => <button key={candidate.source + '-' + candidate.personId} type="button" onClick={() => { onIdentityChange({ ...identity, checker: candidate }); setCheckerQuery('') }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-800">{candidate.name} <span className="font-normal text-slate-600">- {candidate.personId}</span></button>)}
            {candidates.length === 0 ? <p className="px-3 py-2 text-sm text-slate-600">No matching checker.</p> : null}
          </div> : null}
          </div>
          <button type="button" aria-label={'Confirm ' + confirmLabel} disabled={confirmDisabled} onClick={onConfirm} className="flex size-[4.5rem] items-center justify-center rounded-full border-2 border-emerald-950/30 bg-focus-accent text-focus-accent-foreground shadow-lg shadow-emerald-950/20 transition hover:bg-focus-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/20 disabled:text-white/50"><Check aria-hidden="true" size={38} strokeWidth={3} /></button>
        </section>
        {children}
      </div>
      </div>
    </div>
  )
}

export function WelcomePage() {
  const navigate = useNavigate()
  const defaults = useMemo(() => createDefaultShiftRegistrationFormValues(new Date()), [])
  const [modal, setModal] = useState<LandingModal>()
  const [masterData, setMasterData] = useState<MasterData>()
  const [masterDataStatus, setMasterDataStatus] = useState<MasterDataStatus>({ kind: 'loading' })
  const [isRetryingMasterData, setIsRetryingMasterData] = useState(false)
  const [identity, setIdentity] = useState<WorkIdentity>({ values: defaults })
  const [matches, setMatches] = useState<readonly LocalShiftWorkspace[]>([])
  const [recoveryCandidates, setRecoveryCandidates] = useState<readonly LocalShiftWorkspace[]>()
  const [selectedMatch, setSelectedMatch] = useState<LocalShiftWorkspace>()
  const [resumeError, setResumeError] = useState<string>()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const mountedRef = useRef(true)
  const masterDataRequestInFlightRef = useRef(false)
  const incompleteSetupPath = useMemo(() => recoverableSetupPath(), [])

  const loadMasterData = useCallback(async (isManualRetry = false) => {
    if (masterDataRequestInFlightRef.current) return
    masterDataRequestInFlightRef.current = true
    if (isManualRetry) setIsRetryingMasterData(true)
    setMasterDataStatus({ kind: 'loading' })
    try {
      const result = await loadLandingMasterData({
        readCachedMasterData: () => localOperationalStore.readCachedMasterData(),
        refreshMasterData: () => refreshAppsScriptMasterData(),
        isOnline: () => navigator.onLine,
      })
      if (!mountedRef.current) return
      if (result.kind === 'ready') {
        setMasterData(result.masterData)
        setMasterDataStatus({ kind: 'ready' })
      } else setMasterDataStatus(result)
    } catch {
      if (mountedRef.current) setMasterDataStatus({ kind: 'failed', code: 'MASTER_DATA_UNAVAILABLE' })
    } finally {
      masterDataRequestInFlightRef.current = false
      if (mountedRef.current) setIsRetryingMasterData(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadMasterData()
    return () => { mountedRef.current = false }
  }, [loadMasterData])

  const completeIdentity = isComplete(identity, masterData)
  useEffect(() => {
    let cancelled = false
    if (modal !== 'resume' || !completeIdentity || !identity.checker) return
    void localOperationalStore.findLocalWorkspaces({
      date: identity.values.shiftDate,
      shiftCode: identity.values.shiftCode,
      sectorCode: identity.values.sectorCode,
      samplingHouseCode: identity.values.samplingHouseCode,
      checkerPersonId: identity.checker.personId,
    }).then((result) => {
      if (cancelled) return
      if (result.ok) setMatches(result.value)
      else setResumeError('Unable to search local work records.')
    })
    return () => { cancelled = true }
  }, [completeIdentity, identity, modal])

  const resetResumeLookup = useCallback(() => {
    setSelectedMatch(undefined)
    setMatches([])
    setRecoveryCandidates(undefined)
    setResumeError(undefined)
    setIsDiscovering(false)
  }, [])
  function handleIdentityChange(nextIdentity: WorkIdentity) {
    if (modal === 'resume') resetResumeLookup()
    setIdentity(nextIdentity)
  }
  function openModal(next: Exclude<LandingModal, undefined>, trigger?: HTMLButtonElement) {
    triggerRef.current = trigger ?? null
    resetResumeLookup()
    setIsSubmitting(false)
    setModal(next)
  }
  const closeModal = useCallback(() => {
    setModal(undefined)
    resetResumeLookup()
    triggerRef.current?.focus()
  }, [resetResumeLookup])
  function confirmNew() {
    if (!completeIdentity || !identity.checker || isSubmitting) return
    setIsSubmitting(true)
    navigate('/start', { state: { forceNew: true, identityLocked: true, setupValues: identity.values, setupChecker: identity.checker } })
  }
  async function confirmResume() {
    if (!selectedMatch || isSubmitting) return
    setIsSubmitting(true)
    const result = await localOperationalStore.resumeLocalWorkspaceById(selectedMatch.shift.id)
    if (result.ok && result.value) navigate('/production')
    else {
      setResumeError('The selected work record is no longer available on this device.')
      setIsSubmitting(false)
    }
  }
  async function discoverSavedWorkspaces() {
    if (isDiscovering) return
    setIsDiscovering(true)
    setResumeError(undefined)
    const result = await localOperationalStore.listLocalWorkspaces()
    if (result.ok) {
      setRecoveryCandidates(result.value)
    } else {
      setResumeError('Unable to inspect saved local work records.')
    }
    setIsDiscovering(false)
  }

  const masterDataMessage = masterDataStatus.kind === 'loading'
    ? 'Loading master data…'
    : masterDataStatus.kind === 'offline-first-use'
      ? 'Internet is required to download master data on first use.'
      : masterDataStatus.kind === 'failed'
        ? masterDataStatus.code === 'GOOGLE_CONFIG_UNAVAILABLE'
          ? 'Master data is not configured for this app build.'
          : 'Master data is unavailable. Check the connection and try again.'
        : undefined

  return (
    <main className="safe-top safe-bottom safe-x relative isolate flex min-h-dvh flex-col overflow-x-clip bg-[#003d32] text-white">
      <img src={import.meta.env.BASE_URL + 'images/landing/ops-mine-landing.png'} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,55,45,0.94)_0%,rgba(0,68,55,0.73)_43%,rgba(0,36,29,0.84)_100%)]" />
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-5 py-[clamp(0.75rem,2dvh,1rem)]">
        <header><div data-testid="temporary-q-logo" aria-label="Temporary QPS logo placeholder" className="flex size-12 items-center justify-center rounded-2xl bg-lime-300 text-3xl font-black text-emerald-950 shadow-lg">Q</div></header>
        <section className="mt-[clamp(1.75rem,5dvh,3rem)] min-w-0">
          <h1 data-testid="landing-title" className="type-display-lg w-full min-w-0 whitespace-nowrap max-[340px]:whitespace-normal">Ore Quality Assurance</h1>
          <div className="mt-4 flex items-start gap-3"><span className="mt-0.5 h-12 w-1 shrink-0 rounded-full bg-lime-300" /><div><p className="type-brand-subtitle">Production &amp; Sampling Record System</p><p className="type-page-subtitle mt-1 text-white/75">Elevate workflow with an intelligent field recording system.</p></div></div>
        </section>
        <section className="mt-[clamp(1.75rem,5dvh,3.5rem)]"><p className="type-section-subtitle text-white/80">Semangat pagi,</p><h2 className="type-display-md">Quality Ranger</h2><p className="type-body-strong mt-3 text-lime-200">Every One Safe: Always!</p></section>
        <section className="mt-[clamp(1.5rem,4dvh,3rem)] space-y-3" aria-label="Work record actions">
          <button type="button" onClick={(event) => openModal('resume', event.currentTarget)} className="flex w-full items-center gap-3 rounded-[1.4rem] border border-white/70 bg-white/95 p-2.5 text-left text-emerald-950 shadow-xl shadow-emerald-950/25 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"><span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><FileSearch size={32} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><span className="type-section-title block">Continue Record</span><span className="type-body-muted mt-1 block text-slate-500">Resume an existing local work record.</span></span><ChevronRight aria-hidden size={24} strokeWidth={2.2} /></button>
          {incompleteSetupPath ? <button type="button" onClick={() => navigate(incompleteSetupPath)} className="flex w-full items-center gap-3 rounded-[1.4rem] border border-white/70 bg-white/95 p-2.5 text-left text-emerald-950 shadow-xl shadow-emerald-950/25 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"><span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><FileCheck2 size={32} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><span className="type-section-title block">Continue Setup</span><span className="type-body-muted mt-1 block text-slate-500">Resume the unfinished setup on this device.</span></span><ChevronRight aria-hidden size={24} strokeWidth={2.2} /></button> : null}
          <button type="button" onClick={(event) => openModal('new', event.currentTarget)} className="flex w-full items-center gap-3 rounded-[1.4rem] border border-white/70 bg-white/95 p-2.5 text-left text-emerald-950 shadow-xl shadow-emerald-950/25 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"><span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><FilePlus2 size={32} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><span className="type-section-title block">New Record</span><span className="type-body-muted mt-1 block text-slate-500">Create a production or sampling work record.</span></span><ChevronRight aria-hidden size={24} strokeWidth={2.2} /></button>
          <button type="button" onClick={() => navigate('/workspace-backup')} className="w-full rounded-xl border border-white/35 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-focus-accent">Workspace Backup &amp; Restore</button>
          {masterDataMessage ? <div role={masterDataStatus.kind === 'loading' ? undefined : 'alert'} className="rounded-xl bg-emerald-950/75 p-3 text-sm text-white"><p>{masterDataMessage}</p>{masterDataStatus.kind === 'failed' || isRetryingMasterData ? <button type="button" onClick={() => void loadMasterData(true)} disabled={masterDataStatus.kind === 'loading'} className="mt-2 min-h-9 rounded-lg border border-white/35 px-3 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:opacity-60">Try Again / Coba Lagi</button> : null}</div> : null}
        </section>
        <footer className="mt-auto grid grid-cols-3 gap-1 rounded-[1.35rem] border border-white/15 bg-emerald-950/85 px-2 py-3 text-center text-[10px] font-semibold text-white/90 shadow-xl backdrop-blur-md"><span className="flex flex-col items-center gap-1"><ShieldCheck size={23} className="text-lime-300" />QUALITY</span><span className="flex flex-col items-center gap-1 border-l border-white/20"><Truck size={23} className="text-lime-300" />PRODUCTION</span><span className="flex flex-col items-center gap-1 border-l border-white/20"><Users size={23} className="text-lime-300" />SAMPLING</span></footer>
      </div>
      {modal === 'new' ? <IdentityDialog title="NEW RECORD" identity={identity} masterData={masterData} confirmLabel="Create Work Setup" confirmDisabled={!completeIdentity || isSubmitting} onIdentityChange={handleIdentityChange} onCancel={closeModal} onConfirm={confirmNew} /> : null}
      {modal === 'resume' ? <IdentityDialog title="CONTINUE RECORD" identity={identity} masterData={masterData} confirmLabel="Continue Record" confirmDisabled={!selectedMatch || isSubmitting} onIdentityChange={handleIdentityChange} onCancel={closeModal} onConfirm={() => void confirmResume()}>
        {matches.length > 0 ? <p className="mt-2 text-xs font-semibold text-lime-200">Exact identity matches</p> : null}
        <section className="mt-2" aria-live="polite">{!completeIdentity ? <p className="text-xs text-white/75">Choose the full work identity to search this device.</p> : null}{resumeError ? <p role="alert" className="text-xs text-red-200">{resumeError}</p> : null}{completeIdentity && !resumeError && matches.length === 0 ? <p className="text-xs text-white/75">No matching local work record was found.</p> : null}{matches.map((workspace) => <button key={workspace.shift.id} type="button" onClick={() => setSelectedMatch(workspace)} aria-pressed={selectedMatch?.shift.id === workspace.shift.id} className={cn('mt-2 w-full rounded-xl border p-3 text-left text-sm hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-focus-accent', selectedMatch?.shift.id === workspace.shift.id ? 'border-focus-accent bg-focus-accent-soft/15' : 'border-white/25 bg-white/10')}><span className="block font-bold">{formatShiftDateForDisplay(workspace.shift.date)} · {workspace.shift.shiftCode}</span><span className="block text-white/75">{workspace.shift.sectorCode} · {workspace.shift.samplingHouseCode}</span></button>)}</section>
        <section className="mt-2 border-t border-white/15 pt-2" aria-live="polite">
          <p className="text-xs text-white/75">Can&apos;t find the record? Discovery only reads saved workspaces. Select one explicitly before continuing.</p>
          <button type="button" onClick={() => void discoverSavedWorkspaces()} disabled={isDiscovering} className="mt-2 min-h-9 rounded-lg border border-white/35 px-3 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-focus-accent disabled:opacity-60">{isDiscovering ? 'Finding saved workspaces…' : 'Find saved workspaces on this device'}</button>
          {recoveryCandidates ? <div className="mt-2 space-y-2"><p className="text-xs font-semibold text-lime-200">Recovery candidates — verify identity before selecting</p>{recoveryCandidates.length === 0 ? <p className="text-xs text-white/75">No saved workspaces exist on this browser origin.</p> : recoveryCandidates.map((workspace) => {
            const checker = workspace.manpower.find((assignment) => assignment.jobDeskCode === 'Checker')
            return <button key={workspace.shift.id} type="button" onClick={() => setSelectedMatch(workspace)} aria-pressed={selectedMatch?.shift.id === workspace.shift.id} className={cn('w-full rounded-xl border p-3 text-left text-sm hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-focus-accent', selectedMatch?.shift.id === workspace.shift.id ? 'border-focus-accent bg-focus-accent-soft/15' : 'border-white/25 bg-white/10')}><span className="block font-bold">{formatShiftDateForDisplay(workspace.shift.date)} / {workspace.shift.shiftCode}</span><span className="block text-white/75">{workspace.shift.sectorCode} / {workspace.shift.samplingHouseCode}</span><span className="block text-xs text-white/65">{checker ? `Checker: ${checker.name} (${checker.personId})` : 'Checker: not recorded (legacy workspace)'}</span></button>
          })}</div> : null}
        </section>
      </IdentityDialog> : null}
    </main>
  )
}
