import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { refreshAppsScriptMasterData, subscribeToMasterDataRefreshed } from '@/app/google/google-master-data-sync'
import { reportMasterDataDiagnostic } from '@/app/google/master-data-diagnostics'
import { describeMasterDataRefreshFailure } from '@/application/google/master-data-refresh-diagnostics'
import { searchPersonnel, type PersonnelSearchResult } from '@/application/manpower/personnel-search'
import { createDefaultShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { ChevronRight, ChartNoAxesCombined, FilePlus2, FileSearch, FlaskConical, ShieldCheck, Truck } from 'lucide-react'

type LandingMode = 'new' | 'resume' | undefined

interface ReturnedWorkSetupDraft {
  readonly manpower: {
    readonly checkerPersonId?: string
    readonly selected: readonly {
      readonly personId: string
      readonly name: string
      readonly source: 'EMPLOYEE' | 'CREW'
      readonly jobDeskCode: string
    }[]
  }
}

function CheckerSearch({ query, onQueryChange, candidates, selected, onSelect }: {
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly candidates: readonly PersonnelSearchResult[]
  readonly selected?: PersonnelSearchResult
  readonly onSelect: (candidate: PersonnelSearchResult) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <input value={selected ? `${selected.name} - ${selected.personId}` : query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('landing.searchChecker')} aria-label={t('landing.searchChecker')} className="h-11 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground" />
      {query.trim() && !selected ? <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
        {candidates.map((candidate) => <button key={`${candidate.source}-${candidate.personId}`} type="button" onClick={() => onSelect(candidate)} className="min-h-11 rounded-md border border-border px-3 text-left text-sm">
          {candidate.name} <span className="text-muted-foreground">- {candidate.personId}</span>
        </button>)}
      </div> : null}
    </div>
  )
}

/** Why Landing has no master data. Codes/table/row only — never a name, ID or error message. */
interface MasterDataFailure {
  readonly offline?: boolean
  readonly code?: string
  readonly table?: string
  readonly rowNumber?: number
}

function failureFrom(error: DomainError, stage?: 'CACHE_READ'): MasterDataFailure {
  const { code, table, rowNumber } = describeMasterDataRefreshFailure(error, stage, new Date())
  return { code, table, rowNumber }
}

/**
 * Cached snapshot first (offline-first); otherwise waits for the shared,
 * single-flight refresh and uses its already-validated result directly.
 * Never writes or clears anything itself — only the refresh replaces the
 * cache, and only after the full payload validates.
 */
async function loadLandingMasterData(): Promise<Result<MasterData, MasterDataFailure>> {
  const cached = await localOperationalStore.readCachedMasterData()
  if (cached.ok && cached.value) return ok(cached.value.masterData)
  if (!cached.ok) {
    reportMasterDataDiagnostic(describeMasterDataRefreshFailure(cached.error, 'CACHE_READ', new Date()))
  }
  if (!navigator.onLine) {
    return err(cached.ok ? { offline: true } : { ...failureFrom(cached.error, 'CACHE_READ'), offline: true })
  }
  const refreshed = await refreshAppsScriptMasterData()
  return refreshed.ok ? ok(refreshed.value.masterData) : err(failureFrom(refreshed.error))
}

/**
 * Loads Landing master data once per mount (not per language), adopts any
 * later successful shared refresh, and exposes a guarded manual retry.
 * No state is set after unmount.
 */
function useLandingMasterData() {
  const [masterData, setMasterData] = useState<MasterData>()
  const [failure, setFailure] = useState<MasterDataFailure>()
  const [retrying, setRetrying] = useState(false)
  const mounted = useRef(false)
  const loading = useRef(false)

  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const loaded = await loadLandingMasterData()
      if (!mounted.current) return
      if (loaded.ok) {
        setMasterData(loaded.value)
        setFailure(undefined)
      } else {
        setFailure(loaded.error)
      }
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    const unsubscribe = subscribeToMasterDataRefreshed((entry) => {
      if (!mounted.current) return
      setMasterData(entry.masterData)
      setFailure(undefined)
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [load])

  const retry = useCallback(async () => {
    if (loading.current) return
    setRetrying(true)
    await load()
    if (mounted.current) setRetrying(false)
  }, [load])

  return { masterData, failure, retrying, retry }
}

/** Local-only Landing. It selects a Checker then delegates all setup validation to the existing Start flow. */
export function WelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const returnedSetupDraft = (location.state as { readonly setupDraft?: ReturnedWorkSetupDraft } | null)?.setupDraft
  const returnedChecker = returnedSetupDraft?.manpower.selected.find(
    (person) => person.personId === returnedSetupDraft.manpower.checkerPersonId,
  )
  const defaults = useMemo(() => createDefaultShiftRegistrationFormValues(new Date()), [])
  const [mode, setMode] = useState<LandingMode>(() => (returnedChecker ? 'new' : undefined))
  const { masterData, failure: masterDataFailure, retrying, retry } = useLandingMasterData()
  const [newQuery, setNewQuery] = useState('')
  const [resumeQuery, setResumeQuery] = useState('')
  const [newChecker, setNewChecker] = useState<PersonnelSearchResult | undefined>(() =>
    returnedChecker
      ? { personId: returnedChecker.personId, name: returnedChecker.name, source: returnedChecker.source }
      : undefined,
  )
  const [resumeChecker, setResumeChecker] = useState<PersonnelSearchResult>()
  const [resumeDate, setResumeDate] = useState(defaults.shiftDate)
  const [resumeShift, setResumeShift] = useState(defaults.shiftCode)
  /** A translation key, so the message follows a language switch. */
  const [error, setError] = useState<string>()

  const newCandidates = useMemo(() => (masterData ? searchPersonnel(masterData, newQuery) : []), [masterData, newQuery])
  const resumeCandidates = useMemo(() => (masterData ? searchPersonnel(masterData, resumeQuery) : []), [masterData, resumeQuery])

  function toggle(next: LandingMode) { setMode((current) => current === next ? undefined : next); setError(undefined) }
  async function continueLanding() {
    setError(undefined)
    if (mode === 'new' && newChecker) { navigate('/start', { state: { forceNew: true, setupChecker: newChecker, setupDraft: returnedSetupDraft } }); return }
    if (mode === 'resume' && resumeChecker && resumeDate && resumeShift) {
      const result = await localOperationalStore.resumeLocalWorkspace(resumeDate, resumeShift, resumeChecker.personId)
      if (result.ok && result.value) navigate('/production')
      else setError('landing.resumeNotFound')
    }
  }
  const canContinue = (mode === 'new' && !!newChecker) || (mode === 'resume' && !!resumeChecker && !!resumeDate && !!resumeShift)

  return (
    <main className="safe-top safe-bottom safe-x relative isolate min-h-dvh overflow-hidden bg-[#003d32] text-white">
      <img
        src="/images/ops-mine-landing.png"
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,55,45,0.94)_0%,rgba(0,68,55,0.73)_43%,rgba(0,36,29,0.84)_100%)]" />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" aria-label="OPS Quality">
            <span className="flex size-9 items-center justify-center rounded-xl bg-lime-300 text-lg font-black text-emerald-950 shadow-lg">O</span>
            <span className="text-sm font-bold tracking-[0.18em]">QPS QUALITY</span>
          </div>
          <div className="rounded-full border border-white/30 bg-black/10 p-1 backdrop-blur-sm">
            <LanguageSwitcher compact />
          </div>
        </header>

        <section className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">{t('landing.eyebrow')}</p>
          <h1 className="mt-2 text-[2.7rem] font-black leading-[0.9] tracking-tight">{t('landing.title')}</h1>
          <div className="mt-3 flex items-start gap-3">
            <span className="mt-0.5 h-12 w-1 rounded-full bg-lime-300" />
            <div>
              <p className="text-xl font-bold leading-tight">{t('landing.productTitle')}</p>
              <p className="mt-1 text-sm text-white/75">{t('landing.tagline')}</p>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <p className="text-lg font-medium text-white/80">{t('landing.greeting')}</p>
          <h2 className="text-4xl font-extrabold tracking-tight">{t('landing.user')}</h2>
          <p className="mt-3 max-w-xs text-base leading-relaxed text-white/80">{t('landing.tagline')}</p>
        </section>

        <section className="mt-12 space-y-3" aria-label={t('landing.title')}>
          <button
            type="button"
            onClick={() => toggle('resume')}
            className="flex w-full items-center gap-4 rounded-[1.4rem] border border-white/70 bg-white/95 p-3 text-left text-emerald-950 shadow-xl shadow-emerald-950/25 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          >
            <span className="flex size-[4.7rem] shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><FileSearch size={38} strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1"><span className="block text-xl font-bold">{t('landing.resumeRecord')}</span><span className="mt-1 block text-sm leading-snug text-slate-500">{t('landing.resumeDescription')}</span></span>
            <ChevronRight aria-hidden size={30} strokeWidth={2.2} />
          </button>
          {mode === 'resume' ? <div className="rounded-2xl border border-white/30 bg-emerald-950/75 p-3 shadow-lg backdrop-blur-md">
            <div className="grid grid-cols-[3fr_2fr] gap-2"><input type="date" value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} aria-label={t('landing.date')} className="h-11 rounded-xl border border-white/25 bg-white px-3 text-emerald-950" /><select value={resumeShift} onChange={(event) => setResumeShift(event.target.value)} aria-label={t('landing.shift')} className="h-11 rounded-xl border border-white/25 bg-white px-3 text-emerald-950"><option value="D">D</option><option value="N">N</option></select></div>
            <div className="mt-2"><CheckerSearch query={resumeQuery} onQueryChange={(query) => { setResumeChecker(undefined); setResumeQuery(query) }} candidates={resumeCandidates} selected={resumeChecker} onSelect={(checker) => { setResumeChecker(checker); setResumeQuery('') }} /></div>
          </div> : null}
          <button
            type="button"
            onClick={() => toggle('new')}
            className="flex w-full items-center gap-4 rounded-[1.4rem] border border-white/70 bg-white/95 p-3 text-left text-emerald-950 shadow-xl shadow-emerald-950/25 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          >
            <span className="flex size-[4.7rem] shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><FilePlus2 size={38} strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1"><span className="block text-xl font-bold">{t('landing.newRecord')}</span><span className="mt-1 block text-sm leading-snug text-slate-500">{t('landing.newDescription')}</span></span>
            <ChevronRight aria-hidden size={30} strokeWidth={2.2} />
          </button>
          {mode === 'new' ? <div className="rounded-2xl border border-white/30 bg-emerald-950/75 p-3 shadow-lg backdrop-blur-md"><CheckerSearch query={newQuery} onQueryChange={(query) => { setNewChecker(undefined); setNewQuery(query) }} candidates={newCandidates} selected={newChecker} onSelect={(checker) => { setNewChecker(checker); setNewQuery('') }} /></div> : null}
          {masterDataFailure ? <div role="alert" className="rounded-xl bg-red-950/85 p-3 text-sm text-white">
            <p>{t('landing.masterDataUnavailable')}</p>
            {masterDataFailure.offline ? <p className="mt-1 text-white/80">{t('shiftStart.masterData.offlineFirstUse')}</p> : null}
            {masterDataFailure.code ? <p className="mt-1 font-mono text-xs text-white/70" data-testid="master-data-diagnostic">
              <span className="block">{masterDataFailure.code}</span>
              {masterDataFailure.table ? <span className="block">{masterDataFailure.rowNumber !== undefined ? t('landing.masterDataRow', { table: masterDataFailure.table, row: masterDataFailure.rowNumber }) : masterDataFailure.table}</span> : null}
            </p> : null}
            <button type="button" disabled={retrying} onClick={() => void retry()} className="mt-2 min-h-11 rounded-lg border border-white/40 bg-white/15 px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50">{retrying ? t('landing.masterDataRetrying') : t('landing.masterDataRetry')}</button>
          </div> : null}
          {error ? <p role="alert" className="rounded-xl bg-red-950/85 p-3 text-sm text-white">{t(error)}</p> : null}
          {mode ? <button type="button" className="min-h-12 w-full rounded-xl bg-lime-300 px-4 font-bold text-emerald-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={!canContinue} onClick={() => void continueLanding()}>{t('landing.continue')}</button> : null}
        </section>

        <footer className="mt-5 grid grid-cols-4 rounded-[1.35rem] border border-white/15 bg-emerald-950/85 px-2 py-3 text-center text-[10px] font-semibold text-white/90 shadow-xl backdrop-blur-md">
          <span className="flex flex-col items-center gap-1"><ShieldCheck size={23} className="text-lime-300" />{t('landing.quality')}</span>
          <span className="flex flex-col items-center gap-1 border-l border-white/20"><Truck size={23} className="text-lime-300" />{t('landing.production')}</span>
          <span className="flex flex-col items-center gap-1 border-l border-white/20"><FlaskConical size={23} className="text-lime-300" />{t('landing.sampling')}</span>
          <span className="flex flex-col items-center gap-1 border-l border-white/20"><ChartNoAxesCombined size={23} className="text-lime-300" />{t('landing.monitoring')}</span>
        </footer>
      </div>
    </main>
  )
}
