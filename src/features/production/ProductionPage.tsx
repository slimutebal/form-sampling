import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Link, useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { activeRegistrationsForPile } from '@/application/pile-registration/registration-context'
import {
  deriveProductionOperationalCounters,
  deriveDashboardBatchSummaries,
  deriveOperationalBatchStates,
  effectiveProductionRowsForPile,
  formatBatchCode,
  formatProductionTripNo,
  formatTripWithinBatch,
  isEffectiveIncrementProductionRecord,
  sortProductionHistoryRows,
  type ProductionHistorySortDirection,
  type ProductionHistorySortKey,
  type ProductionRecordDisplayRow,
  type DashboardBatchSummary,
} from '@/application/production/production-record-presentation'
import { findPileArea } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import { ProductionRecordEntry } from '@/features/production/production-record-entry'
import { SampleHandlingPage } from '@/features/samples/sample-handling-page'
import { cn } from '@/components/ui/cn'
import { AutoFitSingleLineText } from '@/components/shared/AutoFitSingleLineText'

type Mode = 'production' | 'samples'
type LoadPhase =
  | { readonly kind: 'loading'; readonly loadKey: string }
  | { readonly kind: 'error'; readonly loadKey: string }
  | { readonly kind: 'loaded'; readonly loadKey: string; readonly records: readonly ProductionRecord[] }

function timeOf(row: ProductionRecordDisplayRow): string {
  const date = row.record.audit.createdAt
  return date ? String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') : '—'
}

interface PilePagerProps {
  piles: readonly Pile[]
  selectedPileId: string | undefined
  rowsForPile: (pile: Pile) => readonly ProductionRecordDisplayRow[]
  masterData: ActiveWorkspaceContext['workspace']['masterData']
  cardsPerPage?: 3 | 4
  onSelect: (pileId: string) => void
}

/** Page-grouped selector; Record history uses four cards, Add uses three. */
function ActivePilePager({ piles, selectedPileId, rowsForPile, masterData, cardsPerPage = 4, onSelect }: PilePagerProps) {
  const selectedIndex = piles.findIndex((pile) => (pile.id as string) === selectedPileId)
  const initialPage = selectedIndex < 0 ? 0 : Math.floor(selectedIndex / cardsPerPage)
  const pagerKey = `${selectedPileId ?? ''}:${cardsPerPage}:${piles.map((pile) => pile.id).join('|')}`
  return <ActivePilePagerContent key={pagerKey} piles={piles} selectedPileId={selectedPileId} rowsForPile={rowsForPile} masterData={masterData} cardsPerPage={cardsPerPage} onSelect={onSelect} initialPage={initialPage} />
}

function ActivePilePagerContent({ piles, selectedPileId, rowsForPile, masterData, cardsPerPage = 4, onSelect, initialPage }: PilePagerProps & { readonly initialPage: number }) {
  const [page, setPage] = useState(initialPage)
  const touchStart = useRef<number | undefined>(undefined)
  const pages = useMemo(() => Array.from({ length: Math.ceil(piles.length / cardsPerPage) }, (_, index) => piles.slice(index * cardsPerPage, index * cardsPerPage + cardsPerPage)), [piles, cardsPerPage])
  const current = pages[Math.min(page, Math.max(0, pages.length - 1))] ?? []
  return <section aria-label="Active Pile pager" className="shrink-0" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX }} onTouchEnd={(event) => { const start = touchStart.current; const end = event.changedTouches[0]?.clientX; if (start === undefined || end === undefined || Math.abs(start - end) < 36) return; setPage((value) => start > end ? Math.min(pages.length - 1, value + 1) : Math.max(0, value - 1)) }}>
    <div className={cn('grid gap-1', cardsPerPage === 4 ? 'grid-cols-4' : 'grid-cols-3')}>{current.map((pile) => {
      const counters = deriveProductionOperationalCounters(rowsForPile(pile).map((row) => row.record), pile, masterData)
      const sap = pile.oreCode === 'SAP'
      const selectedTheme = sap ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800 bg-amber-800 text-white'
      const pileAccent = sap ? 'text-emerald-800' : 'text-amber-900'
      const selected = selectedPileId === (pile.id as string)
      return <button key={pile.id} type="button" onClick={() => onSelect(pile.id as string)} className={cn('min-w-0 rounded-lg border px-2 py-2 text-left', selected ? selectedTheme : 'border-border bg-muted/30')}><AutoFitSingleLineText text={pile.id as string} minFontSize={10} className={cn('text-base font-bold leading-tight', selected ? 'text-white' : pileAccent)} /><span className={cn('mt-1 block truncate text-[10px] leading-tight', selected ? 'text-white/80' : 'text-muted-foreground')}>{counters.tripCount} Trip . {counters.incrementCount} Incr</span></button>
    })}{Array.from({ length: Math.max(0, cardsPerPage - current.length) }, (_, index) => <span key={'blank-' + index} />)}</div>
    {pages.length > 1 ? <div className="mt-1 flex items-center justify-center gap-2"><button type="button" aria-label="Previous Pile page" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="text-xs disabled:opacity-30">‹</button>{pages.map((_, index) => <button key={index} type="button" aria-label={'Pile page ' + (index + 1)} onClick={() => setPage(index)} className={cn('h-2 w-2 rounded-full', page === index ? 'bg-primary' : 'bg-muted-foreground/30')} />)}<button type="button" aria-label="Next Pile page" disabled={page >= pages.length - 1} onClick={() => setPage((value) => Math.min(pages.length - 1, value + 1))} className="text-xs disabled:opacity-30">›</button></div> : null}
  </section>
}

interface DashboardBatchPagerProps {
  batches: readonly DashboardBatchSummary[]
  sapTheme: boolean
  resetKey: string
}

/** Five compact, page-snapped Batch cards; ACTIVE registrations always lead page one. */
function DashboardBatchPager({ batches, sapTheme, resetKey }: DashboardBatchPagerProps) {
  return <DashboardBatchPagerContent key={resetKey} batches={batches} sapTheme={sapTheme} />
}

function DashboardBatchPagerContent({ batches, sapTheme }: Omit<DashboardBatchPagerProps, 'resetKey'>) {
  const [page, setPage] = useState(0)
  const touchStart = useRef<number | undefined>(undefined)
  const pages = useMemo(() => Array.from({ length: Math.ceil(batches.length / 5) }, (_, index) => batches.slice(index * 5, index * 5 + 5)), [batches])
  const current = pages[Math.min(page, Math.max(0, pages.length - 1))] ?? []
  const activeTheme = sapTheme ? 'border-emerald-600 bg-emerald-50 text-emerald-950' : 'border-amber-800 bg-amber-50 text-amber-950'
  const historicalTheme = sapTheme ? 'border-emerald-200 bg-emerald-50/35 text-emerald-800' : 'border-amber-300 bg-amber-50/35 text-amber-800'
  return <section aria-label="Dashboard Batch cards" className="shrink-0" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX }} onTouchEnd={(event) => { const start = touchStart.current; const end = event.changedTouches[0]?.clientX; if (start === undefined || end === undefined || Math.abs(start - end) < 32) return; setPage((value) => start > end ? Math.min(pages.length - 1, value + 1) : Math.max(0, value - 1)) }}>
    <div className="grid grid-cols-5 gap-1">{current.map((batch) => <div key={batch.batchNumber} data-active={batch.isActive ? 'true' : undefined} className={cn('min-w-0 rounded border px-1.5 py-1', batch.isActive ? activeTheme : historicalTheme)}><div className="flex items-baseline justify-between gap-1"><strong className="text-xl leading-none">{formatBatchCode(batch.batchNumber)}</strong><span className="text-[9px] text-muted-foreground">Front</span></div><p className="mt-1 truncate text-[10px] font-medium leading-tight">{batch.frontCodes.length ? batch.frontCodes.join(' · ') : '—'}</p></div>)}{Array.from({ length: Math.max(0, 5 - current.length) }, (_, index) => <span key={'blank-' + index} />)}</div>
    {pages.length > 1 ? <div className="mt-1 flex justify-center gap-1">{pages.map((_, index) => <span key={index} aria-label={'Batch page ' + (index + 1)} className={cn('h-1.5 w-1.5 rounded-full', index === page ? sapTheme ? 'bg-emerald-600' : 'bg-amber-800' : 'bg-muted-foreground/30')} />)}</div> : null}
  </section>
}

/** Fixed Record workspace: only the history list itself scrolls. */
export function ProductionPage() {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const [mode, setMode] = useState<Mode>('production')
  const [reloadToken, setReloadToken] = useState(0)
  const loadKey = `${workspace.shift.id}:${reloadToken}`
  const [loadedPhase, setLoadedPhase] = useState<LoadPhase>(() => ({ kind: 'loading', loadKey }))
  const phase = useMemo<LoadPhase>(
    () => loadedPhase.loadKey === loadKey ? loadedPhase : { kind: 'loading', loadKey },
    [loadedPhase, loadKey],
  )
  const [selectedPileId, setSelectedPileId] = useState<string>()
  const [expandedTransactionId, setExpandedTransactionId] = useState<string>()
  const [activeSort, setActiveSort] = useState<ProductionHistorySortKey>('rec')
  const [recDirection, setRecDirection] = useState<ProductionHistorySortDirection>('desc')
  const [batchDirection, setBatchDirection] = useState<ProductionHistorySortDirection>('desc')
  const [batchQuery, setBatchQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [sampleAddRequest, setSampleAddRequest] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [batchPagerReset, setBatchPagerReset] = useState(0)
  const [historyResetToken, setHistoryResetToken] = useState(0)
  const historyListRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.listProductionRecordsForShift(workspace.shift.id).then((result) => {
      if (!cancelled) setLoadedPhase(result.ok ? { kind: 'loaded', loadKey, records: result.value } : { kind: 'error', loadKey })
    })
    return () => { cancelled = true }
  }, [workspace.shift.id, reloadToken, loadKey])

  const activePiles = useMemo(() => workspace.piles.filter((pile) => activeRegistrationsForPile(workspace.pileRegistrations, pile.id).length > 0), [workspace.pileRegistrations, workspace.piles])
  const selectedPile = activePiles.find((pile) => (pile.id as string) === selectedPileId) ?? activePiles[0]
  const rowsForPile = (pile: Pile) => phase.kind === 'loaded' ? effectiveProductionRowsForPile(phase.records, pile.id) : []
  const rows = useMemo(
    () => selectedPile && phase.kind === 'loaded' ? effectiveProductionRowsForPile(phase.records, selectedPile.id) : [],
    [phase, selectedPile],
  )
  const dashboardCounters = useMemo(() => selectedPile && phase.kind === 'loaded'
    ? deriveProductionOperationalCounters(phase.records, selectedPile, workspace.masterData)
    : { tripCount: 0, incrementCount: 0, rejectCount: 0, wrongTruckCount: 0 }, [phase, selectedPile, workspace.masterData])
  const operationalBatchStates = useMemo(() => selectedPile && phase.kind === 'loaded'
    ? deriveOperationalBatchStates(workspace.masterData, selectedPile, phase.records, workspace.pileRegistrations)
    : undefined, [phase, selectedPile, workspace.masterData, workspace.pileRegistrations])
  const dashboardBatches = useMemo(() => selectedPile && phase.kind === 'loaded' && operationalBatchStates?.ok
    ? deriveDashboardBatchSummaries(phase.records, selectedPile, operationalBatchStates.value)
    : [], [phase, selectedPile, operationalBatchStates])
  const normalizedBatchFilter = batchQuery.replace(/^0+/, '')
  const batchFilterNumber = normalizedBatchFilter ? Number(normalizedBatchFilter) : undefined
  const batchFilteredRows = useMemo(() => batchFilterNumber === undefined
    ? rows
    : rows.filter((row) => row.batchNumber === batchFilterNumber), [rows, batchFilterNumber])
  const sortDirection = activeSort === 'rec' ? recDirection : batchDirection
  const visibleRows = useMemo(() => sortProductionHistoryRows(batchFilteredRows, activeSort, sortDirection), [batchFilteredRows, activeSort, sortDirection])
  const pileArea = selectedPile ? findPileArea(workspace.masterData, selectedPile.id) : undefined
  // The entry derivation filters its Pile itself; passing all rows preserves
  // inactive and other-Pile registrations when it persists a continuation.
  const activeRegistrations = workspace.pileRegistrations
  function selectPile(pileId: string) {
    setSelectedPileId(pileId); resetHistoryView()
  }
  function resetHistoryView() {
    setActiveSort('rec'); setRecDirection('desc'); setBatchQuery(''); setExpandedTransactionId(undefined); setBatchPagerReset((value) => value + 1)
    setHistoryResetToken((value) => value + 1)
  }
  function selectSort(key: ProductionHistorySortKey) {
    if (activeSort === key) {
      if (key === 'rec') setRecDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
      else setBatchDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
      return
    }
    setActiveSort(key)
    if (key === 'rec') setRecDirection('desc')
    else setBatchDirection('desc')
  }
  useEffect(() => {
    function add() {
      if (mode === 'production') {
        if (selectedPile) setAddOpen(true)
      } else setSampleAddRequest((value) => value + 1)
    }
    window.addEventListener('record-workspace:add', add)
    return () => window.removeEventListener('record-workspace:add', add)
  }, [mode, selectedPile])
  useEffect(() => {
    if (mode === 'production') resetHistoryView()
  }, [mode])
  useEffect(() => {
    if (mode === 'production' && !addOpen) historyListRef.current?.scrollTo?.({ top: 0 })
  }, [historyResetToken, mode, addOpen])
  function href(row: ProductionRecordDisplayRow, suffix = ''): string {
    return '/production/detail/' + encodeURIComponent(row.record.transaction.pileId as string) + '/batch/' + row.batchNumber + '/rit/' + row.tripWithinBatch + suffix
  }
  const sapTheme = selectedPile?.oreCode === 'SAP'
  const badgeTheme = sapTheme ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
  const boundaryTheme = sapTheme ? 'border-t-emerald-400' : 'border-t-amber-700'
  const activeSortTheme = sapTheme ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-800 bg-amber-800 text-white'
  const incrementStripTheme = sapTheme ? 'border-l-emerald-600' : 'border-l-amber-800'
  const batchToneByNumber = useMemo(() => {
    const fills = sapTheme ? ['bg-emerald-50/35', 'bg-emerald-100/35'] : ['bg-amber-50/35', 'bg-amber-100/35']
    return new Map([...new Set(visibleRows.map((row) => row.batchNumber))].sort((left, right) => left - right).map((batch, index) => [batch, fills[index % 2]!]))
  }, [visibleRows, sapTheme])

  return <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="record-workspace">
    <section aria-label="Production dashboard" className="shrink-0 border-b border-border px-5 py-2"><div className={cn('flex h-[calc((100dvh-7.5rem)/6)] min-h-[132px] max-h-40 flex-col gap-2 rounded-lg border-l-4 bg-muted/40 px-3 py-2.5', sapTheme ? 'border-l-emerald-600' : 'border-l-amber-800')}>{selectedPile ? <><div className="grid grid-cols-[minmax(0,.9fr)_minmax(0,2.1fr)] items-start gap-2"><AutoFitSingleLineText text={selectedPile.id as string} minFontSize={16} className="text-[clamp(28px,8vw,34px)] font-extrabold leading-none tracking-tight" /><div aria-label="Production summary" className="grid grid-cols-4 gap-1 text-center"><span><small className="block text-[8px] leading-tight text-muted-foreground">Total Trip</small><strong className="text-sm leading-tight">{dashboardCounters.tripCount}</strong></span><span><small className="block text-[8px] leading-tight text-muted-foreground">Total Batch</small><strong className="text-sm leading-tight">{dashboardBatches.length}</strong></span><span><small className="block text-[8px] leading-tight text-muted-foreground">Total Incr</small><strong className="text-sm leading-tight">{dashboardCounters.incrementCount}</strong></span><span><small className="block text-[8px] leading-tight text-muted-foreground">Total Reject</small><strong className={cn('text-sm leading-tight', dashboardCounters.rejectCount > 0 ? 'text-red-700' : 'text-muted-foreground')}>{dashboardCounters.rejectCount}</strong></span></div></div><div className="sr-only">{pileArea?.stockpileCode ?? '—'} {selectedPile.oreCode}</div><DashboardBatchPager batches={dashboardBatches} sapTheme={sapTheme} resetKey={(selectedPile.id as string) + ':' + batchPagerReset} /></> : <p className="text-sm text-muted-foreground">No active Pile registration.</p>}</div></section>
    <div className="shrink-0 px-5 py-2"><div className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1"><button type="button" onClick={() => setMode('production')} className={cn('h-9 rounded-md text-xs font-bold shadow-sm', mode === 'production' ? sapTheme ? 'bg-emerald-600 text-white' : 'bg-amber-800 text-white' : 'text-muted-foreground')}>PRODUCTION</button><button type="button" onClick={() => setMode('samples')} className={cn('h-9 rounded-md text-xs font-bold', mode === 'samples' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>SAMPLE HANDLING</button></div></div>
    {mode === 'samples' ? <div className="min-h-0 flex-1 overflow-y-auto"><SampleHandlingPage shift={workspace.shift} piles={workspace.piles} masterData={workspace.masterData} deliveryDestinations={[]} store={localOperationalStore} embedded addRequest={sampleAddRequest} /></div> : addOpen ? null : <>
      <section aria-label="Production history controls" className="shrink-0 border-b border-border px-5 py-1.5"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1"><label className="relative min-w-0"><Search aria-hidden="true" size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search Batch" inputMode="numeric" value={batchQuery} onChange={(event) => setBatchQuery(event.target.value)} placeholder="Search Batch..." className="h-8 w-full min-w-0 rounded border border-input bg-background pl-7 pr-2 text-xs" /></label><button type="button" aria-pressed={activeSort === 'batch'} onClick={() => selectSort('batch')} className={cn('rounded border px-2 py-1 text-xs font-semibold', activeSort === 'batch' ? activeSortTheme : 'border-border bg-background')}>Batch {batchDirection === 'asc' ? '▲' : '▼'}</button><button type="button" aria-pressed={activeSort === 'rec'} onClick={() => selectSort('rec')} className={cn('rounded border px-2 py-1 text-xs font-semibold', activeSort === 'rec' ? activeSortTheme : 'border-border bg-background')}>Rec {recDirection === 'asc' ? '▲' : '▼'}</button></div></section>
      <section ref={historyListRef} aria-label="Production records" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-2">{phase.kind === 'loading' ? <p className="py-3 text-sm text-muted-foreground">Loading Production records…</p> : null}{phase.kind === 'error' ? <p role="alert" className="py-3 text-sm text-red-700">Unable to load Production records.</p> : null}{feedback ? <p role="status" className="mb-2 rounded bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{feedback}</p> : null}{phase.kind === 'loaded' && batchFilteredRows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No accepted Production records.</p> : null}<div className="border-y border-border"><div className="sticky top-0 z-10 grid grid-cols-[.52fr_.8fr_1.25fr_1fr_1.25rem] gap-1.5 bg-background px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span>Trip</span><span>Fleet</span><span>Truck</span><span>Batch</span><span /></div>{visibleRows.map((row, index) => {
        const record = row.record
        const transactionId = record.transaction.id as string
        const expanded = expandedTransactionId === transactionId
        const increment = selectedPile ? isEffectiveIncrementProductionRecord(record, selectedPile, workspace.masterData) : false
        const boundary = index > 0 && visibleRows[index - 1]!.batchNumber !== row.batchNumber
        const batchFill = batchToneByNumber.get(row.batchNumber)
        return <article key={transactionId} data-batch-boundary={boundary || undefined} className={cn('border-t border-border', boundary && ['border-t-2', boundaryTheme])}><button type="button" aria-expanded={expanded} onClick={() => setExpandedTransactionId(expanded ? undefined : transactionId)} className={cn('grid w-full grid-cols-[.52fr_.8fr_1.25fr_1fr_1.25rem] items-center gap-1.5 border-l-[6px] px-3 py-2 text-left text-sm', batchFill, increment ? incrementStripTheme : 'border-l-transparent')}><strong>{formatProductionTripNo(row.tripNo)}</strong><strong className="truncate">{record.effective.frontId}</strong><strong className="truncate">{record.effective.truckId}</strong><span className="whitespace-nowrap"><strong>{formatBatchCode(row.batchNumber)}</strong><span className="text-xs text-muted-foreground">/{formatTripWithinBatch(row.tripWithinBatch)}</span></span>{expanded ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}</button>{expanded ? <div className="border-t border-border bg-white px-3 py-2.5"><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"><span>Time <strong className="float-right">{timeOf(row)}</strong></span><span>Condition <strong className="float-right">{record.effective.physicalCondition ?? '—'}</strong></span><span>Contam. <strong className="float-right">{record.effective.contamination ?? '—'}</strong></span></div><div className="mt-1 flex items-start gap-2 text-xs"><strong className="shrink-0">Remark</strong><span className="min-w-0 flex-1 break-words">{record.effective.remark ?? '—'}</span></div><div className="mt-3 flex justify-between gap-2"><Link to={href(row, '/edit?tx=' + encodeURIComponent(record.transaction.id as string))} className="rounded border border-border px-3 py-1.5 text-center text-xs font-semibold">Edit</Link><Link to={href(row)} className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-center text-xs font-semibold text-red-700">Void</Link></div></div> : null}</article>
      })}</div></section>
      <section className="shrink-0 border-t border-border bg-background px-5 py-2"><ActivePilePager piles={activePiles} selectedPileId={selectedPile?.id as string | undefined} rowsForPile={rowsForPile} masterData={workspace.masterData} cardsPerPage={4} onSelect={selectPile} /></section>
    </>}
    {addOpen && selectedPile ? <><div aria-hidden="true" className="fixed inset-0 z-20 bg-black/20" /><div role="dialog" aria-modal="true" aria-label="Add Production" className="fixed inset-x-0 bottom-0 z-30 flex h-[75dvh] max-h-[75dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl"><div className="shrink-0 border-b border-border px-5 py-3"><div className="flex items-center justify-between"><strong>Add Production</strong><button type="button" aria-label="Close Add Production" onClick={() => setAddOpen(false)} className="rounded border border-border p-1"><X aria-hidden="true" size={18} /></button></div><div className="mt-2"><ActivePilePager piles={activePiles} selectedPileId={selectedPile.id as string} rowsForPile={rowsForPile} masterData={workspace.masterData} onSelect={selectPile} /></div><div className="mt-3 flex items-start justify-between gap-3"><strong className="text-lg">{selectedPile.id}</strong><span className="text-xs text-muted-foreground">{pileArea?.stockpileCode ?? '—'} <span className={cn('rounded px-1.5 py-0.5 font-semibold', badgeTheme)}>{selectedPile.oreCode}</span></span></div></div><div className="scrollbar-none min-h-0 flex-1 overflow-y-auto"><ProductionRecordEntry key={selectedPile.id as string} shift={workspace.shift} pile={selectedPile} masterData={workspace.masterData} fleetSetup={workspace.fleetSetup} manpower={workspace.manpower} pendingBatches={workspace.pendingBatches} registrations={activeRegistrations} store={localOperationalStore} showPileContext={false} onClose={() => setAddOpen(false)} onFleetUpdated={refreshWorkspace} onRecorded={() => { setAddOpen(false); resetHistoryView(); setFeedback('Production saved.'); setReloadToken((value) => value + 1) }} /></div></div></> : null}
  </div>
}
