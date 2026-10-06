import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { Check, FilePenLine, MoreVertical, Plus, X, type LucideProps } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { useOnlineStatus } from '@/app/hooks/useOnlineStatus'
import { useShiftSummarySyncPresentation } from '@/app/hooks/useShiftSummarySyncPresentation'
import {
  deriveConfirmedSampleBatchTrip,
  deriveSampleBatchProgress,
} from '@/application/sample-handling/sample-batch-progress'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { displayExcaCode } from '@/domain/fleet/exca-code'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { ActiveFleetAddSheet } from '@/features/registration/active-fleet-add-sheet'
import { ActiveManpowerDialog } from '@/features/registration/active-manpower-dialog'
import { ActivePileRegistrationForm } from '@/features/registration/active-pile-registration'
import {
  FleetSafetyIcon,
  ManpowerSafetyIcon,
  SampleSafetyIcon,
} from '@/features/registration/setup-safety-icons'

type PanelName = 'manpower' | 'sample' | 'fleet'

interface SetupPanelProps {
  readonly title: string
  readonly count: string
  readonly Icon: (props: LucideProps) => ReactNode
  readonly ratio: 1 | 2
  readonly expanded: boolean
  readonly sectionRef?: Ref<HTMLElement>
  readonly hasMore: boolean
  readonly onToggle: () => void
  readonly children: ReactNode
}

function SetupPanel({
  title,
  count,
  Icon,
  ratio,
  expanded,
  sectionRef,
  hasMore,
  onToggle,
  children,
}: SetupPanelProps) {
  const sectionClass =
    ratio === 1
      ? 'flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden rounded-lg border border-border bg-background'
      : 'flex min-h-0 flex-[2_1_0%] flex-col overflow-hidden rounded-lg border border-border bg-background'

  return (
    <section ref={sectionRef} className={sectionClass}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Icon aria-hidden="true" size={26} className="shrink-0 text-primary" />
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <span className="ml-auto text-[13px] font-medium text-foreground">{count}</span>
      </div>
      <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1">
        <div>{children}</div>
        {hasMore ? (
          <button
            type="button"
            className="mt-1 self-end text-xs font-medium text-muted-foreground"
            onClick={onToggle}
          >
            {expanded ? 'Show Less ⌃' : 'Show More ⌄'}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function formatTime(date: Date | undefined): string {
  if (!date) return '---'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function ManpowerRow({
  person,
  isCrew,
}: {
  readonly person: ManpowerAssignment
  readonly isCrew: boolean
}) {
  return (
    <div
      data-testid={`manpower-row-${person.personId}`}
      className="grid grid-cols-[3px_18px_minmax(0,1fr)] items-center gap-x-2 py-1.5"
    >
      <span
        aria-hidden="true"
        data-testid={`manpower-crew-strip-${person.personId}`}
        className={isCrew ? 'self-stretch bg-blue-500/70' : 'self-stretch'}
      />
      <span className="flex size-4 items-center justify-center">
        {/checker/i.test(person.jobDeskCode) ? (
          <FilePenLine aria-label="Checker" size={15} strokeWidth={1.8} className="text-primary" />
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {person.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {person.personId} · {person.jobDeskCode}
        </p>
      </div>
    </div>
  )
}

/** Active-shift Setup dashboard; pre-shift Sample Setup remains a dedicated screen. */
export function RegistrationPage() {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const sync = useShiftSummarySyncPresentation(localOperationalStore)
  const [expandedPanel, setExpandedPanel] = useState<PanelName>()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [manpowerFormOpen, setManpowerFormOpen] = useState(false)
  const [sampleFormOpen, setSampleFormOpen] = useState(false)
  const [sampleCanSubmit, setSampleCanSubmit] = useState(false)
  const [fleetFormOpen, setFleetFormOpen] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState<PileRegistrationDraft>()
  const [actionError, setActionError] = useState<string>()
  const [safeRegistrationKeys, setSafeRegistrationKeys] = useState<ReadonlySet<string>>(new Set())
  const [openSampleActionKey, setOpenSampleActionKey] = useState<string>()
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<Date>()
  const [samplePositions, setSamplePositions] = useState<readonly SamplePosition[]>([])
  const [productionRecords, setProductionRecords] = useState<readonly ProductionRecord[]>([])
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 720 : window.innerHeight,
  )
  const samplePanelRef = useRef<HTMLElement>(null)
  const [samplePanelHeight, setSamplePanelHeight] = useState(0)
  const [sampleModalViewport, setSampleModalViewport] = useState(() => ({
    height: typeof window === 'undefined' ? 720 : window.visualViewport?.height ?? window.innerHeight,
    offsetTop: typeof window === 'undefined' ? 0 : window.visualViewport?.offsetTop ?? 0,
  }))

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.getShiftSummarySyncRecord(workspace.shiftId).then((result) => {
      if (!cancelled && result.ok)
        setLastSuccessfulSync(
          result.value?.status === 'SYNCED' ? result.value.updatedAt : undefined,
        )
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shiftId])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      localOperationalStore.listSamplePositionsForShift(workspace.shiftId),
      localOperationalStore.listProductionRecordsForShift(workspace.shiftId),
    ]).then(([positions, records]) => {
      if (cancelled) return
      if (positions.ok) setSamplePositions(positions.value)
      if (records.ok) setProductionRecords(records.value)
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shiftId])

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!sampleFormOpen) return
    const visualViewport = window.visualViewport
    const updateViewport = () =>
      setSampleModalViewport({
        height: visualViewport?.height ?? window.innerHeight,
        offsetTop: visualViewport?.offsetTop ?? 0,
      })
    visualViewport?.addEventListener('resize', updateViewport)
    visualViewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport)
      visualViewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [sampleFormOpen])

  function openSampleForm(registration?: PileRegistrationDraft) {
    setEditingRegistration(registration)
    setSampleCanSubmit(false)
    setSampleFormOpen(true)
  }

  function closeSampleForm() {
    setSampleCanSubmit(false)
    setSampleFormOpen(false)
    setEditingRegistration(undefined)
  }

  useEffect(() => {
    const panel = samplePanelRef.current
    if (!panel) return
    const updateHeight = () => {
      if (panel.clientHeight > 0) setSamplePanelHeight(panel.clientHeight)
    }
    updateHeight()
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateHeight)
    observer?.observe(panel)
    return () => observer?.disconnect()
  }, [])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setAddMenuOpen(false)
      setManpowerFormOpen(false)
      closeSampleForm()
      setFleetFormOpen(false)
      setOpenSampleActionKey(undefined)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const personnel = useMemo(() => {
    const seen = new Set<string>()
    return [...workspace.manpower]
      .filter((person) => {
        if (seen.has(person.personId)) return false
        seen.add(person.personId)
        return true
      })
      .sort((left, right) => {
        const rank = (job: string) =>
          /pengawas|foreman|supervisor/i.test(job)
            ? 0
            : /checker/i.test(job)
              ? 1
              : /sampler|crew/i.test(job)
                ? 2
                : 3
        return (
          rank(left.jobDeskCode) - rank(right.jobDeskCode) || left.name.localeCompare(right.name)
        )
      })
  }, [workspace.manpower])
  const supervisors = personnel.filter((person) => person.isPic)
  const crew = personnel.filter((person) => !supervisors.includes(person))
  const registrations = useMemo(
    () =>
      [...workspace.pileRegistrations].sort(
        (a, b) =>
          String(a.pileId).localeCompare(String(b.pileId), undefined, {
            numeric: true,
            sensitivity: 'base',
          }) || Number(a.batch) - Number(b.batch),
      ),
    [workspace.pileRegistrations],
  )
  const fleetRows = useMemo(() => {
    const lineage = deriveFrontLineage(workspace.fleetSetup)
    return workspace.fleetSetup.fronts
      .filter((front) => lineage.activeFrontIds.includes(front.frontId))
      .map((front) => {
        const fleet = workspace.fleetSetup.fleets.find(
          (candidate) => candidate.frontId === front.frontId,
        )
        const effective = fleet
          ? resolveEffectiveFleetAgainstMaster(
              workspace.masterData,
              workspace.fleetSetup,
              fleet.fleetId,
            )
          : undefined
        return { front, truckCount: effective?.ok ? effective.value.truckIds.length : 0 }
      })
      .sort((a, b) => a.front.frontId.localeCompare(b.front.frontId, undefined, { numeric: true }))
  }, [workspace.fleetSetup, workspace.masterData])
  const registrationKey = (row: PileRegistrationDraft) => `${row.pileId}-${row.batch}`
  // Sample occupies two fifths of the three-section area. Use its measured
  // height so the compact preview fits that fixed share without affecting
  // Manpower or Fleet.
  const samplePreviewCapacity =
    samplePanelHeight > 0
      ? Math.max(2, Math.floor((samplePanelHeight - 48) / 48))
      : Math.max(2, Math.floor((viewportHeight - 270) / 48))
  const previewLimitFor = (panel: PanelName) => (panel === 'sample' ? samplePreviewCapacity : 3)
  const togglePanel = (panel: PanelName) =>
    setExpandedPanel((current) => (current === panel ? undefined : panel))
  const rowsFor = <T,>(rows: readonly T[], panel: PanelName) =>
    expandedPanel === panel ? rows : rows.slice(0, previewLimitFor(panel))

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      registrations.map(async (row) => {
        const [haulage, production, samples] = await Promise.all([
          localOperationalStore.listHaulageTransactionsForShiftPile(workspace.shiftId, row.pileId),
          localOperationalStore.listProductionRecordsForShiftPile(workspace.shiftId, row.pileId),
          localOperationalStore.listSamplePositionsForShiftPile(workspace.shiftId, row.pileId),
        ])
        if (!haulage.ok || !production.ok || !samples.ok) return undefined
        const batch = Number(row.batch)
        const used =
          haulage.value.some((item) => Number(item.batchPosition.batchNumber) === batch) ||
          production.value.some(
            (item) =>
              Number(item.transaction.batchPosition.batchNumber) === batch ||
              Number(item.effective.batchPosition.batchNumber) === batch,
          ) ||
          samples.value.some((item) => Number(item.batchNumber) === batch)
        return used ? undefined : registrationKey(row)
      }),
    ).then((keys) => {
      if (!cancelled)
        setSafeRegistrationKeys(new Set(keys.filter((key): key is string => Boolean(key))))
    })
    return () => {
      cancelled = true
    }
  }, [registrations, workspace.shiftId])

  const sampleRows = useMemo(
    () =>
      registrations.map((row) => {
        const confirmedTrip = deriveConfirmedSampleBatchTrip(
          productionRecords,
          row.pileId,
          row.batch,
        )
        const progress = deriveSampleBatchProgress(
          row,
          workspace.masterData,
          samplePositions,
          confirmedTrip ?? Number(row.rit),
        )
        const positions = samplePositions.filter(
          (position) =>
            position.pileId === row.pileId && Number(position.batchNumber) === Number(row.batch),
        )
        const deliveredPosition = positions.find(
          (position) => position.delivery.status === 'DELIVERED',
        )
        const deliveredDestination =
          deliveredPosition?.delivery.status === 'DELIVERED'
            ? deliveredPosition.delivery.destination
            : undefined
        const complete = Boolean(
          progress && progress.producedIncrementCount >= progress.totalIncrementCount,
        )
        const physicalNote =
          row.sampleInHouse !== undefined && row.sampleInHouse > 0
            ? { text: `${row.sampleInHouse} Sample In House`, delivered: false }
            : deliveredDestination &&
                (row.sampleInHouse === 0 || progress?.inHouseIncrementCount === 0)
              ? { text: `Delivered to ${deliveredDestination}`, delivered: true }
              : row.sampleInHouse === 0
                ? { text: '0 Sample In House', delivered: false }
                : { text: 'Not inspected', delivered: false }
        return { row, key: registrationKey(row), complete, physicalNote }
      }),
    [productionRecords, registrations, samplePositions, workspace.masterData],
  )

  async function removeRegistration(row: PileRegistrationDraft) {
    setActionError(undefined)
    const [haulage, production, samples] = await Promise.all([
      localOperationalStore.listHaulageTransactionsForShiftPile(workspace.shiftId, row.pileId),
      localOperationalStore.listProductionRecordsForShiftPile(workspace.shiftId, row.pileId),
      localOperationalStore.listSamplePositionsForShiftPile(workspace.shiftId, row.pileId),
    ])
    if (!haulage.ok || !production.ok || !samples.ok) {
      setActionError('Unable to verify registration history.')
      return
    }
    const batch = Number(row.batch)
    const used =
      haulage.value.some((item) => Number(item.batchPosition.batchNumber) === batch) ||
      production.value.some(
        (item) =>
          Number(item.transaction.batchPosition.batchNumber) === batch ||
          Number(item.effective.batchPosition.batchNumber) === batch,
      ) ||
      samples.value.some((item) => Number(item.batchNumber) === batch)
    if (used) {
      setActionError('This Sample has operational history and cannot be deleted.')
      return
    }
    const result = await localOperationalStore.updatePileRegistrations(
      workspace.shiftId,
      workspace.pileRegistrations.filter(
        (item) => !(item.pileId === row.pileId && Number(item.batch) === batch),
      ),
    )
    if (!result.ok) {
      setActionError('Unable to save Sample Setup.')
      return
    }
    setOpenSampleActionKey(undefined)
    refreshWorkspace()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/20">
      <header className="safe-top shrink-0 border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">SETUP</h1>
          <p
            className={`text-xs font-medium ${online ? 'text-muted-foreground' : 'text-amber-700'}`}
          >
            {online ? 'Online' : 'Offline'} · {sync.status === 'ALL_SYNCED' ? 'Synced' : 'Unsynced'}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Work location
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {workspace.shift.sectorCode} · {workspace.shift.samplingHouseCode}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs leading-4 text-muted-foreground">
            <p>Last sync</p>
            <p className="font-medium text-foreground">{formatTime(lastSuccessfulSync)}</p>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
        <SetupPanel
          title="Manpower"
          count={`${supervisors.length} Pengawas · ${crew.length} Crew`}
          Icon={ManpowerSafetyIcon}
          ratio={1}
          expanded={expandedPanel === 'manpower'}
          hasMore={personnel.length > previewLimitFor('manpower')}
          onToggle={() => togglePanel('manpower')}
        >
          {personnel.length === 0 ? (
            <p className="text-sm text-foreground">No personnel assigned.</p>
          ) : (
            <div className="divide-y divide-border">
              {rowsFor(personnel, 'manpower').map((person) => (
                <ManpowerRow key={person.personId} person={person} isCrew={!person.isPic} />
              ))}
            </div>
          )}
        </SetupPanel>
        <SetupPanel
          title="Sample"
          count={`${registrations.length} Samples`}
          Icon={SampleSafetyIcon}
          ratio={2}
          expanded={expandedPanel === 'sample'}
          sectionRef={samplePanelRef}
          hasMore={sampleRows.length > samplePreviewCapacity}
          onToggle={() => togglePanel('sample')}
        >
          {sampleRows.length === 0 ? (
            <p className="text-sm text-foreground">No Samples registered.</p>
          ) : (
            <div className="divide-y divide-border">
              {rowsFor(sampleRows, 'sample').map(({ row, key, complete, physicalNote }) => (
                <div
                  key={key}
                  className="grid grid-cols-[3px_minmax(0,1fr)_64px_88px_28px] items-center gap-x-1.5 py-2"
                >
                  <span
                    aria-hidden="true"
                    className={`self-stretch ${row.status === 'ACTIVE' ? 'bg-emerald-600' : 'bg-muted-foreground/40'}`}
                  />
                  <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                    {row.pileId}
                  </p>
                  <p className="text-center text-[13px] font-semibold tabular-nums text-foreground">
                    {String(row.batch).padStart(2, '0')}/{String(row.rit).padStart(3, '0')}
                  </p>
                  <div className="min-w-0 text-right leading-4">
                    <p
                      className={`truncate text-xs font-medium ${complete ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {complete ? 'Complete' : 'Incomplete'}
                    </p>
                    <p
                      className={`truncate text-right text-xs font-medium ${physicalNote.delivered ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {physicalNote.text}
                    </p>
                  </div>
                  {safeRegistrationKeys.has(key) ? (
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Sample actions for ${row.pileId} batch ${row.batch}`}
                        className="flex size-7 items-center justify-center text-foreground"
                        onClick={() =>
                          setOpenSampleActionKey((current) => (current === key ? undefined : key))
                        }
                      >
                        <MoreVertical aria-hidden="true" size={17} />
                      </button>
                      {openSampleActionKey === key ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-8 z-30 w-24 rounded-md border border-border bg-background p-1 shadow-lg"
                        >
                          <button
                            role="menuitem"
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              openSampleForm(row)
                              setOpenSampleActionKey(undefined)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            role="menuitem"
                            type="button"
                            className="block w-full rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-muted"
                            onClick={() => void removeRegistration(row)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="size-7" />
                  )}
                </div>
              ))}
            </div>
          )}
        </SetupPanel>
        <SetupPanel
          title="Fleet"
          count={`${fleetRows.length} Fleets`}
          Icon={FleetSafetyIcon}
          ratio={2}
          expanded={expandedPanel === 'fleet'}
          hasMore={fleetRows.length > previewLimitFor('fleet')}
          onToggle={() => togglePanel('fleet')}
        >
          {fleetRows.length === 0 ? (
            <p className="text-sm text-foreground">No Fleet registered.</p>
          ) : (
            <div className="divide-y divide-border">
              {rowsFor(fleetRows, 'fleet').map(({ front, truckCount }) => (
                <div
                  key={front.frontId}
                  className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-2 py-2"
                >
                  <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                    {front.frontId} <span className="mx-2">→</span> {front.destinationPileId ?? '—'}
                  </p>
                  <p className="text-right text-xs font-medium leading-5 text-foreground">
                    {displayExcaCode(front.excaCode)}
                    <br />
                    {truckCount} Trucks
                  </p>
                  <button
                    type="button"
                    aria-label={`Edit Fleet ${front.frontId}`}
                    className="flex size-7 items-center justify-center text-foreground"
                    onClick={() =>
                      navigate('/fleet', {
                        state: { adjustFrontId: front.frontId, returnTo: '/regist' },
                      })
                    }
                  >
                    <MoreVertical aria-hidden="true" size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SetupPanel>
        {actionError ? (
          <p role="alert" className="shrink-0 px-1 text-sm text-red-700">
            {actionError}
          </p>
        ) : null}
      </div>

      {addMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close add setup menu"
            className="fixed inset-0 z-20 cursor-default bg-black/35"
            onClick={() => setAddMenuOpen(false)}
          />
          <div
            role="menu"
            aria-label="Add setup item"
            className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-3 z-30 w-48 rounded-xl border border-border bg-background p-2 shadow-2xl"
          >
            <button
              role="menuitem"
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-muted"
              onClick={() => {
                setManpowerFormOpen(true)
                setAddMenuOpen(false)
              }}
            >
              Manpower
              <ManpowerSafetyIcon aria-hidden="true" size={18} className="text-primary" />
            </button>
            <button
              role="menuitem"
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-muted"
              onClick={() => {
                openSampleForm()
                setAddMenuOpen(false)
              }}
            >
              Sample
              <SampleSafetyIcon aria-hidden="true" size={18} className="text-primary" />
            </button>
            <button
              role="menuitem"
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-muted"
              onClick={() => {
                setFleetFormOpen(true)
                setAddMenuOpen(false)
              }}
            >
              Fleet
              <FleetSafetyIcon aria-hidden="true" size={18} className="text-primary" />
            </button>
          </div>
        </>
      ) : null}
      <button
        type="button"
        aria-label="Add setup item"
        aria-expanded={addMenuOpen}
        onClick={() => setAddMenuOpen((open) => !open)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
      >
        <Plus aria-hidden="true" size={25} />
      </button>

      {manpowerFormOpen ? (
        <ActiveManpowerDialog onClose={() => setManpowerFormOpen(false)} />
      ) : null}
      {fleetFormOpen ? <ActiveFleetAddSheet onClose={() => setFleetFormOpen(false)} /> : null}
      {sampleFormOpen ? (
        <button
          type="button"
          aria-label="Dismiss Sample"
          className="fixed inset-0 z-40 cursor-default bg-black/30"
          onClick={closeSampleForm}
        />
      ) : null}
      {sampleFormOpen ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={editingRegistration ? 'Edit Sample' : 'Add Sample'}
          style={{
            top: `${Math.round(
              sampleModalViewport.offsetTop +
                Math.max(
                  12,
                  (sampleModalViewport.height -
                    Math.max(200, Math.min(620, sampleModalViewport.height - 32))) *
                    0.56,
                ),
            )}px`,
            maxHeight: `${Math.max(200, Math.min(620, sampleModalViewport.height - 32))}px`,
          }}
          className="fixed left-1/2 z-50 flex w-[calc(100vw-24px)] max-w-[440px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
        >
          <div className="relative flex shrink-0 items-center justify-end border-b border-border px-3 py-2">
            <h2 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center text-[18px] font-semibold text-foreground">
              {editingRegistration ? 'Edit Sample' : 'Add Sample'}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Close Sample"
                className="flex size-11 items-center justify-center text-red-700"
                onClick={closeSampleForm}
              >
                <X aria-hidden="true" size={22} />
              </button>
              <button
                type="submit"
                form="active-sample-form"
                aria-label="Save Sample"
                disabled={!sampleCanSubmit}
                className="flex size-11 items-center justify-center text-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Check aria-hidden="true" size={22} />
              </button>
            </div>
          </div>
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ActivePileRegistrationForm
              formId="active-sample-form"
              initialRegistration={editingRegistration}
              onCanSubmitChange={setSampleCanSubmit}
              onSaved={closeSampleForm}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}
