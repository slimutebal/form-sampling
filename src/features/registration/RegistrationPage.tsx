import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, MoreVertical, Pencil, RotateCcw, UserRoundCog, Plus, X, type LucideProps } from 'lucide-react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { useOnlineStatus } from '@/app/hooks/useOnlineStatus'
import { useShiftSummarySyncPresentation } from '@/app/hooks/useShiftSummarySyncPresentation'
import { deriveSampleBatchProgress } from '@/application/sample-handling/sample-batch-progress'
import { deriveSampleDisplayProgress, formatSampleBagCount } from '@/application/sample-handling/sample-display-progress'
import { formatFleetShortLabel } from '@/application/fleet-setup/fleet-assignment-identity'
import { employeeLevelRank } from '@/application/manpower/personnel-order'
import { isCheckerAssignment, operationalJobDescription } from '@/application/manpower/checker-assignment'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { displayExcaCode } from '@/domain/fleet/exca-code'
import { destinationPileIdsForFront } from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { resolveEffectiveFleetAgainstMaster } from '@/domain/fleet/fleet-resolution'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { ProductionRecord } from '@/domain/production/production-record'
import { ActiveFleetAddSheet } from '@/features/registration/active-fleet-add-sheet'
import { ActiveManpowerDialog } from '@/features/registration/active-manpower-dialog'
import { ActivePileRegistrationForm } from '@/features/registration/active-pile-registration'
import { FleetRecordActionDialog, type FleetRecordActionMode } from '@/features/registration/fleet-record-action-dialog'
import { formatFleetCompanyName } from '@/features/registration/format-fleet-company-name'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'
import {
  FleetSafetyIcon,
  SampleSafetyIcon,
} from '@/features/registration/setup-safety-icons'

type PanelName = 'manpower' | 'sample' | 'fleet'
type SetupTab = Exclude<PanelName, 'manpower'>
type SampleSortKey = 'status' | 'plan' | 'batch' | 'sample'
type SampleSort = Readonly<{ key: SampleSortKey; direction: 'asc' | 'desc' }>
type FleetSortKey = 'status' | 'company' | 'fleet' | 'truckQuantity'
type FleetSort = Readonly<{ key: FleetSortKey; direction: 'asc' | 'desc' }>
type FleetActivity = Readonly<{
  haulageTransactions: readonly HaulageTransaction[]
  productionRecords: readonly ProductionRecord[]
}>
type FleetRecordAction = Readonly<{ fleetId: string; mode: FleetRecordActionMode }>
type FleetActionPopover = Readonly<{ fleetId: string; fleetLabel: string; mode: FleetRecordActionMode; left: number; top: number; width: number }>

function FleetReferenceSummary({ outboundReferenceFrontIds, inboundReferenceFrontIds }: Readonly<{ outboundReferenceFrontIds: readonly string[]; inboundReferenceFrontIds: readonly string[] }>): ReactNode {
  const hasOutbound = outboundReferenceFrontIds.length > 0
  const hasInbound = inboundReferenceFrontIds.length > 0
  if (!hasOutbound && !hasInbound) return null

  if (hasOutbound && hasInbound) {
    return <><span className="text-muted-foreground"> · Ref: </span>{outboundReferenceFrontIds.map((frontId, index) => <Fragment key={`to-${frontId}`}><span data-ui="fleet-reference-outbound" className="text-fleet-reference-outbound">to {formatFleetReference(frontId)}</span>{index === outboundReferenceFrontIds.length - 1 ? <span className="text-muted-foreground"> · </span> : <span className="text-muted-foreground">, </span>}</Fragment>)}{inboundReferenceFrontIds.map((frontId, index) => <Fragment key={`by-${frontId}`}><span data-ui="fleet-reference-inbound" className="text-fleet-reference-inbound">by {formatFleetReference(frontId)}</span>{index < inboundReferenceFrontIds.length - 1 ? <span className="text-muted-foreground">, </span> : null}</Fragment>)}</>
  }

  const direction = hasOutbound ? 'to' : 'by'
  const referenceIds = hasOutbound ? outboundReferenceFrontIds : inboundReferenceFrontIds
  const tone = hasOutbound ? 'text-fleet-reference-outbound' : 'text-fleet-reference-inbound'
  const referenceUi = hasOutbound ? 'fleet-reference-outbound' : 'fleet-reference-inbound'
  return <><span className="text-muted-foreground"> · </span>{referenceIds.map((frontId, index) => <Fragment key={`${direction}-${frontId}`}><span data-ui={referenceUi} className={tone}>Ref {direction} {formatFleetReference(frontId)}</span>{index < referenceIds.length - 1 ? <span className="text-muted-foreground"> · </span> : null}</Fragment>)}</>
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/** Presentation bridge while active workspaces still persist legacy `Sector/NN` FrontIds. */
function formatLegacyFleetLabel(frontId: string): string {
  const sequence = Number(frontId.split('/').at(-1))
  return Number.isSafeInteger(sequence) && sequence > 0 ? formatFleetShortLabel(sequence) : frontId
}

function fleetSequence(frontId: string): number | undefined {
  const finalSegment = frontId.split('/').at(-1)?.trim() ?? ''
  const sequence = Number(/\d+$/.exec(finalSegment)?.[0])
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined
}

/** The list's left rail is a compact display label, never the persisted identity. */
function formatFleetNumber(frontId: string): string {
  const sequence = fleetSequence(frontId)
  return sequence === undefined ? frontId.replace(/\D/g, '').slice(-2).padStart(2, '0') : String(sequence).padStart(2, '0')
}

function fleetNumberFontClass(frontId: string): 'qps-fleet-number--odd' | 'qps-fleet-number--even' {
  const sequence = fleetSequence(frontId)
  return sequence !== undefined && sequence % 2 === 0 ? 'qps-fleet-number--even' : 'qps-fleet-number--odd'
}

function formatFleetReference(frontId: string): string {
  return `F${formatFleetNumber(frontId)}`
}

/** Keeps the discriminating truck suffix visible without changing its ID. */
function formatTruckDisplay(truckId: string): Readonly<{ compact: string; suffix: string }> {
  const finalSegment = truckId.split(/[-\s]+/).filter(Boolean).at(-1) ?? truckId
  const compact = /[A-Za-z]\d+_\d+$/.test(finalSegment) ? finalSegment : truckId
  const suffix = /(?:_|-)(\d+)$/.exec(compact)?.[1] ?? /\d+$/.exec(compact)?.[0] ?? compact
  return { compact, suffix }
}

interface SetupPanelProps {
  readonly title: string
  readonly summary?: ReactNode
  readonly status?: ReactNode
  readonly hideTitle?: boolean
  readonly hideHeader?: boolean
  readonly uiId: string
  readonly Icon: (props: LucideProps) => ReactNode
  readonly expanded: boolean
  readonly hasMore: boolean
  readonly onToggle: () => void
  readonly children: ReactNode
  readonly fillAvailableHeight?: boolean
}

function SetupPanel({
  title,
  summary,
  status,
  hideTitle = false,
  hideHeader = false,
  uiId,
  Icon,
  expanded,
  hasMore,
  onToggle,
  children,
  fillAvailableHeight = false,
}: SetupPanelProps) {
  return (
    <section data-ui={uiId} className={`ui-operational-panel flex flex-col ${hideHeader ? 'border-0 overflow-visible' : 'overflow-hidden border-y'} ${fillAvailableHeight ? 'min-h-0 flex-1' : 'shrink-0'}`}>
      {!hideHeader ? <div className={`${hideTitle ? 'flex justify-between gap-[var(--space-section)]' : 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'} shrink-0 items-center border-b border-border px-[var(--space-control)] py-[var(--space-row)]`}>
        {hideTitle ? (
          <>
            {summary ? <div className="min-w-0">{summary}</div> : <span />}
            {status ? <div className="min-w-0 text-right">{status}</div> : <span />}
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-[var(--space-section)]">
              <Icon aria-hidden="true" size={24} className="shrink-0 text-primary" />
              <h2 className="type-section-title text-foreground">{title}</h2>
            </div>
            {summary ? <div className="text-center">{summary}</div> : <span />}
            {status ? <div className="min-w-0 text-right">{status}</div> : <span />}
          </>
        )}
      </div> : null}
      <div className={`flex flex-col px-[var(--space-control)] ${hideHeader ? 'py-0' : 'py-1'} ${fillAvailableHeight ? 'min-h-0 flex-1' : ''}`}>
        <div className={fillAvailableHeight ? 'flex min-h-0 flex-1 flex-col' : ''}>{children}</div>
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

function SetupSummaryTabs({ activeSetupTab, sampleSummary, activeFleetCount, activeFleetTruckCount, fleetToolbarSummary, onSelect }: {
  readonly activeSetupTab: SetupTab
  readonly sampleSummary: { readonly pileCount: number; readonly batchCount: number; readonly inHouse: number; readonly dispatched: number }
  readonly activeFleetCount: number
  readonly activeFleetTruckCount: number
  readonly fleetToolbarSummary: { readonly pileCount: number; readonly batchCount: number }
  readonly onSelect: (tab: SetupTab) => void
}) {
  return <div data-ui="sample-fleet-tabbar" className="work-setup-tabs flex shrink-0 min-w-0 pl-[var(--space-control)] pr-0"><div data-ui="sample-fleet-summary" className="flex min-w-0 items-center gap-4">{activeSetupTab === 'sample' ? <><p data-ui="sample-toolbar-summary-primary" className="shrink-0 whitespace-nowrap type-field-helper font-bold leading-tight text-foreground">{formatCount(sampleSummary.pileCount, 'Pile', 'Piles')} {'\u00b7'} {formatCount(sampleSummary.batchCount, 'Batch', 'Batches')}</p><p data-ui="sample-toolbar-summary-secondary" className={`shrink-0 whitespace-nowrap type-field-helper font-bold leading-tight ${sampleSummary.inHouse > 0 ? 'text-danger' : 'text-success-foreground'}`}>{sampleSummary.inHouse > 0 ? `${sampleSummary.inHouse} In House` : `${formatCount(sampleSummary.dispatched, 'Sample', 'Samples')} Dispatched`}</p></> : <><p data-ui="fleet-toolbar-summary-primary" className="shrink-0 whitespace-nowrap type-field-helper font-bold leading-tight text-foreground">{formatCount(activeFleetCount, 'Fleet', 'Fleets')} {'\u00b7'} {formatCount(activeFleetTruckCount, 'Truck', 'Trucks')}</p><p data-ui="fleet-toolbar-summary-secondary" className="shrink-0 whitespace-nowrap type-field-helper font-bold leading-tight text-foreground">{formatCount(fleetToolbarSummary.pileCount, 'Pile', 'Piles')} {'\u00b7'} {formatCount(fleetToolbarSummary.batchCount, 'Batch', 'Batches')}</p></>}</div><div role="tablist" data-ui="setup-tabs" aria-label="Setup detail" className="grid shrink-0 grid-cols-2"><button type="button" role="tab" data-ui="setup-sample-tab" aria-selected={activeSetupTab === 'sample'} className="ui-setup-tab work-setup-detail-tab px-2 py-1.5" onClick={() => onSelect('sample')}>Sample</button><button type="button" role="tab" data-ui="setup-fleet-tab" aria-selected={activeSetupTab === 'fleet'} className="ui-setup-tab work-setup-detail-tab px-2 py-1.5" onClick={() => onSelect('fleet')}>Fleet</button></div></div>
}

function SortDirection({
  active,
  direction,
}: {
  readonly active: boolean
  readonly direction: 'asc' | 'desc'
}) {
  if (!active) return null
  const Icon = direction === 'desc' ? ArrowDown : ArrowUp
  return <Icon aria-hidden="true" size={13} strokeWidth={2.25} />
}

function SetupSortGroup({
  tab,
  sampleSort,
  fleetSort,
  onSampleSort,
  onFleetSort,
}: {
  readonly tab: SetupTab
  readonly sampleSort: SampleSort
  readonly fleetSort: FleetSort
  readonly onSampleSort: (key: SampleSortKey) => void
  readonly onFleetSort: (key: FleetSortKey) => void
}) {
  return (
    <div data-ui="sample-fleet-sortbar" role="group" aria-label={`${tab === 'sample' ? 'Sample' : 'Fleet'} sorting`} className={`${tab === 'sample' ? 'sample-sort-group' : 'fleet-sort-group'} flex shrink-0`}>
      {tab === 'sample' ? (
        <>
          <button type="button" data-ui="sample-sort-plan" aria-pressed={sampleSort.key === 'plan'} aria-label={`Sort Planned and Unplanned ${sampleSort.key === 'plan' ? sampleSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onSampleSort('plan')}>
            Plan <SortDirection active={sampleSort.key === 'plan'} direction={sampleSort.direction} />
          </button>
          <button type="button" data-ui="sample-sort-batch" aria-pressed={sampleSort.key === 'batch'} aria-label={`Sort Batch ${sampleSort.key === 'batch' ? sampleSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onSampleSort('batch')}>
            Batch <SortDirection active={sampleSort.key === 'batch'} direction={sampleSort.direction} />
          </button>
          <button type="button" data-ui="sample-sort-status" aria-pressed={sampleSort.key === 'status'} aria-label={`Sort Status Completed and Incomplete ${sampleSort.key === 'status' ? sampleSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onSampleSort('status')}>
            Status <SortDirection active={sampleSort.key === 'status'} direction={sampleSort.direction} />
          </button>
          <button type="button" data-ui="sample-sort-sample" aria-pressed={sampleSort.key === 'sample'} aria-label={`Sort Sample ${sampleSort.key === 'sample' ? sampleSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onSampleSort('sample')}>
            Sample <SortDirection active={sampleSort.key === 'sample'} direction={sampleSort.direction} />
          </button>
        </>
      ) : (
        <>
          <button type="button" data-ui="fleet-sort-status" aria-pressed={fleetSort.key === 'status'} aria-label={`Sort Status Active and Inactive ${fleetSort.key === 'status' ? fleetSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onFleetSort('status')}>
            Status <SortDirection active={fleetSort.key === 'status'} direction={fleetSort.direction} />
          </button>
          <button type="button" data-ui="fleet-sort-company" aria-pressed={fleetSort.key === 'company'} aria-label={`Sort Company ${fleetSort.key === 'company' ? fleetSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onFleetSort('company')}>
            Comp. <SortDirection active={fleetSort.key === 'company'} direction={fleetSort.direction} />
          </button>
          <button type="button" data-ui="fleet-sort-id" aria-pressed={fleetSort.key === 'fleet'} aria-label={`Sort Fleet ID ${fleetSort.key === 'fleet' ? fleetSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onFleetSort('fleet')}>
            Fleet <SortDirection active={fleetSort.key === 'fleet'} direction={fleetSort.direction} />
          </button>
          <button type="button" data-ui="fleet-sort-truck-quantity" aria-pressed={fleetSort.key === 'truckQuantity'} aria-label={`Sort Truck Quantity ${fleetSort.key === 'truckQuantity' ? fleetSort.direction : 'ascending'}`} className="ui-sort-control flex shrink-0 items-center gap-1" onClick={() => onFleetSort('truckQuantity')}>
            Truck <SortDirection active={fleetSort.key === 'truckQuantity'} direction={fleetSort.direction} />
          </button>
        </>
      )}
    </div>
  )
}

function shiftName(shiftCode: string): string {
  return shiftCode.startsWith('N') ? 'Night' : 'Day'
}

function compareManpowerPersonId(left: ManpowerAssignment, right: ManpowerAssignment): number {
  return left.personId.localeCompare(right.personId, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Keeps the existing personnel order while filling the left column from top to
 * bottom before continuing in the right column. The caller keeps Lead and Crew
 * separate, so Crew can never occupy an unfinished Lead row.
 */
function columnMajorManpowerRows<T>(people: readonly T[]): readonly (readonly [T | undefined, T | undefined])[] {
  const rowsInLeftColumn = Math.ceil(people.length / 2)
  return Array.from({ length: rowsInLeftColumn }, (_, rowIndex) => [
    people[rowIndex],
    people[rowsInLeftColumn + rowIndex],
  ] as const)
}

function ManpowerRow({
  person,
  level,
  expanded,
  checkerPersonId,
}: {
  readonly person: ManpowerAssignment
  readonly level?: string
  readonly expanded: boolean
  readonly checkerPersonId?: string
}) {
  const isChecker = isCheckerAssignment(person, checkerPersonId)
  // `Crew` is the personnel level. A non-checker Crew member is presented
  // operationally as a Sampler; legacy persisted `Crew` values are not
  // rewritten merely by rendering this preview.
  const detail = person.isPic
    ? person.jobDeskCode.trim() || level?.trim()
    : isChecker
      ? undefined
      : operationalJobDescription(person, false)
  const checkerBadgeClass = 'inline-flex whitespace-nowrap rounded-full border border-[var(--work-setup-tab-active-underline)] bg-[var(--work-setup-tab-active)] px-2 py-0.5 text-[10px] font-bold leading-none text-foreground shadow-sm'

  return (
    <div data-testid={`manpower-row-${person.personId}`} className="min-w-0 py-1">
      <p className="type-field-value min-w-0 break-words font-medium leading-tight text-foreground">
        <span>{person.name}</span>
        {!expanded && isChecker ? (
          <span data-ui="manpower-checker-role" className={`ml-2 ${checkerBadgeClass}`}>
            Checker
          </span>
        ) : null}
      </p>
      {expanded ? (
        <p className="flex min-w-0 flex-wrap items-center gap-1 break-words text-[11px] leading-tight text-muted-foreground">
          <span>{person.personId}</span>
          {detail ? <span>{` \u00b7 ${detail}`}</span> : null}
          {isChecker ? <><span aria-hidden="true">·</span><span data-ui="manpower-checker-role" className={checkerBadgeClass}>Checker</span></> : null}
        </p>
      ) : null}
    </div>
  )
}

/** Active-shift Setup dashboard; pre-shift Sample Setup remains a dedicated screen. */
export function RegistrationPage() {
  const outletContext = useOutletContext<ActiveWorkspaceContext>()
  const { workspace, refreshWorkspace } = outletContext
  const activeSetupTab = outletContext.activeWorkSetupTab ?? 'fleet'
  const setActiveSetupTab = outletContext.setActiveWorkSetupTab ?? (() => undefined)
  const online = useOnlineStatus()
  const sync = useShiftSummarySyncPresentation(localOperationalStore)
  const [expandedPanel, setExpandedPanel] = useState<PanelName>()
  const [manpowerScrolled, setManpowerScrolled] = useState(false)
  const [manpowerFormOpen, setManpowerFormOpen] = useState(false)
  const [sampleFormOpen, setSampleFormOpen] = useState(false)
  const [sampleCanSubmit, setSampleCanSubmit] = useState(false)
  const [fleetFormOpen, setFleetFormOpen] = useState(false)
  const [expandedFleetId, setExpandedFleetId] = useState<string>()
  const [fleetActionPopover, setFleetActionPopover] = useState<FleetActionPopover>()
  const [fleetRecordAction, setFleetRecordAction] = useState<FleetRecordAction>()
  const [editingRegistration, setEditingRegistration] = useState<PileRegistrationDraft>()
  const [actionError, setActionError] = useState<string>()
  const [safeRegistrationKeys, setSafeRegistrationKeys] = useState<ReadonlySet<string>>(new Set())
  const [openSampleActionKey, setOpenSampleActionKey] = useState<string>()
  const [sampleQuery, setSampleQuery] = useState('')
  const [sampleSort, setSampleSort] = useState<SampleSort>({ key: 'plan', direction: 'asc' })
  const [fleetQuery, setFleetQuery] = useState('')
  const [fleetSort, setFleetSort] = useState<FleetSort>({ key: 'status', direction: 'asc' })
  const [fleetActivity, setFleetActivity] = useState<FleetActivity>({
    haulageTransactions: [],
    productionRecords: [],
  })
  const [pendingSampleDelete, setPendingSampleDelete] = useState<PileRegistrationDraft>()
  const [removedSampleKeys, setRemovedSampleKeys] = useState<ReadonlySet<string>>(new Set())
  const pendingSampleDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [samplePositions, setSamplePositions] = useState<readonly SamplePosition[]>([])
  const [sampleModalViewport, setSampleModalViewport] = useState(() => ({
    height: typeof window === 'undefined' ? 720 : window.visualViewport?.height ?? window.innerHeight,
    offsetTop: typeof window === 'undefined' ? 0 : window.visualViewport?.offsetTop ?? 0,
  }))

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.listSamplePositionsForShift(workspace.shiftId).then((positions) => {
      if (cancelled) return
      if (positions.ok) setSamplePositions(positions.value)
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shiftId])

  useEffect(() => {
    if (activeSetupTab !== 'fleet') {
      return
    }
    let cancelled = false
    void Promise.all([
      localOperationalStore.listHaulageTransactionsForShift(workspace.shiftId),
      localOperationalStore.listProductionRecordsForShift(workspace.shiftId),
    ]).then(([haulage, production]) => {
      if (cancelled) return
      setFleetActivity({
        haulageTransactions: haulage.ok ? haulage.value : [],
        productionRecords: production.ok ? production.value : [],
      })
    })
    return () => {
      cancelled = true
    }
  }, [activeSetupTab, workspace.shiftId])

  useEffect(() => {
    if (!fleetActionPopover) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFleetActionPopover(undefined)
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-ui="fleet-action-popover"], [data-ui="fleet-number-action"]')) setFleetActionPopover(undefined)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [fleetActionPopover])

  useEffect(
    () => () => {
      if (pendingSampleDeleteTimer.current) clearTimeout(pendingSampleDeleteTimer.current)
    },
    [],
  )

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
    setActiveSetupTab('sample')
    setEditingRegistration(registration)
    setSampleCanSubmit(false)
    setSampleFormOpen(true)
  }

  function closeSampleForm() {
    // A local Sample interaction never changes the surrounding Sample/Fleet
    // subtab. Fleet is selected only by an explicit tab or main-nav entry.
    setActiveSetupTab('sample')
    setSampleCanSubmit(false)
    setSampleFormOpen(false)
    setEditingRegistration(undefined)
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setManpowerFormOpen(false)
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
            : /sampler|crew/i.test(job)
              ? 1
              : 2
        return (
          rank(left.jobDeskCode) - rank(right.jobDeskCode) || left.name.localeCompare(right.name)
        )
      })
  }, [workspace.manpower])
  const staffLevelById = useMemo(
    () => new Map(workspace.masterData.employees.map((employee) => [employee.id as string, employee.level])),
    [workspace.masterData.employees],
  )
  const supervisors = useMemo(
    () =>
      personnel
        .filter((person) => person.isPic)
        .sort(
          (left, right) =>
            employeeLevelRank(staffLevelById.get(left.personId)) -
              employeeLevelRank(staffLevelById.get(right.personId)) ||
            compareManpowerPersonId(left, right),
        ),
    [personnel, staffLevelById],
  )
  const crew = useMemo(
    () =>
      personnel
        .filter((person) => !person.isPic)
        .sort(
          (left, right) =>
            Number(isCheckerAssignment(right, workspace.checkerPersonId)) -
              Number(isCheckerAssignment(left, workspace.checkerPersonId)) ||
            compareManpowerPersonId(left, right),
        ),
    [personnel, workspace.checkerPersonId],
  )
  const manpowerExpanded = expandedPanel === 'manpower'
  const detailPanelScrollable = true
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
  const fleetBatchNumbersByFleetId = useMemo(() => {
    const registeredBatchKeys = new Set(
      workspace.pileRegistrations
        .map((registration) => `${registration.pileId}-${Number(registration.batch)}`),
    )
    const batchesByFleetId = new Map<string, Map<string, Set<number>>>()
    const productionTransactionIds = new Set(
      fleetActivity.productionRecords.map((record) => record.transaction.id as string),
    )
    const addBatch = (fleetId: string, pileId: string, batchNumber: number) => {
      if (!registeredBatchKeys.has(`${pileId}-${batchNumber}`)) return
      const byPile = batchesByFleetId.get(fleetId) ?? new Map<string, Set<number>>()
      const batches = byPile.get(pileId) ?? new Set<number>()
      batches.add(batchNumber)
      byPile.set(pileId, batches)
      batchesByFleetId.set(fleetId, byPile)
    }

    for (const transaction of fleetActivity.haulageTransactions) {
      if (productionTransactionIds.has(transaction.id as string)) continue
      addBatch(
        transaction.fleetId as string,
        transaction.pileId as string,
        Number(transaction.batchPosition.batchNumber),
      )
    }
    for (const record of fleetActivity.productionRecords) {
      if (record.effective.status === 'VOIDED') continue
      addBatch(
        record.effective.fleetId as string,
        record.transaction.pileId as string,
        Number(record.effective.batchPosition.batchNumber),
      )
    }

    return batchesByFleetId
  }, [fleetActivity, workspace.pileRegistrations])
  const recordedTrucksByFleetPileBatch = useMemo(() => {
    const recorded = new Map<string, Set<string>>()
    for (const record of fleetActivity.productionRecords) {
      if (record.effective.status === 'VOIDED') continue
      const key = `${record.effective.fleetId}|${record.transaction.pileId}|${Number(record.effective.batchPosition.batchNumber)}`
      const trucks = recorded.get(key) ?? new Set<string>()
      trucks.add(record.effective.truckId as string)
      recorded.set(key, trucks)
    }
    return recorded
  }, [fleetActivity.productionRecords])
  const fleetRows = useMemo(() => {
    const lineage = deriveFrontLineage(workspace.fleetSetup)
    const frontById = new Map(workspace.fleetSetup.fronts.map((front) => [front.frontId, front]))
    const fleetById = new Map(workspace.fleetSetup.fleets.map((fleet) => [fleet.fleetId, fleet]))
    return workspace.fleetSetup.fleets
      .map((fleet) => {
        const front = frontById.get(fleet.frontId)
        if (!front) return undefined
        const effective = resolveEffectiveFleetAgainstMaster(
          workspace.masterData,
          workspace.fleetSetup,
          fleet.fleetId,
        )
        const truckIds = effective?.ok ? effective.value.truckIds.map((truckId) => truckId as string) : []
        const destinationPileIds = destinationPileIdsForFront(front).map(String)
        const batchesByPile = fleetBatchNumbersByFleetId.get(fleet.fleetId as string) ?? new Map<string, Set<number>>()
        const batchNumbers = [...new Set(destinationPileIds.flatMap((pileId) => [...(batchesByPile.get(pileId) ?? [])]))].sort((left, right) => left - right)
        const referencedFleet = fleet.kind === 'DERIVED'
          ? fleetById.get(fleet.referenceFleetId)
          : undefined
        const referencedFront = referencedFleet
          ? frontById.get(referencedFleet.frontId)
          : undefined
        const outboundReferenceFrontIds = new Set(referencedFront ? [referencedFront.frontId as string] : [])
        const inboundReferenceFrontIds = new Set(workspace.fleetSetup.fleets
          .filter((candidate) => candidate.kind === 'DERIVED' && candidate.referenceFleetId === fleet.fleetId)
          .map((candidate) => frontById.get(candidate.frontId)?.frontId as string)
          .filter(Boolean))
        for (const transfer of workspace.fleetSetup.operationalState?.formationTransferEvents ?? []) {
          if (transfer.targetFleetAssignmentId === fleet.fleetId) {
            const source = fleetById.get(transfer.sourceFleetAssignmentId)
            if (source) outboundReferenceFrontIds.add(source.frontId as string)
          }
          if (transfer.sourceFleetAssignmentId === fleet.fleetId) {
            const target = fleetById.get(transfer.targetFleetAssignmentId)
            if (target) inboundReferenceFrontIds.add(target.frontId as string)
          }
        }
        const configurationRevisions = [...(workspace.fleetSetup.operationalState?.configurationRevisions ?? [])]
          .filter((revision) => revision.fleetAssignmentId === fleet.fleetId)
          .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.version - right.version)
        const historicalPileIds = configurationRevisions.flatMap((revision) => revision.destinationPileIds.map(String))
        const allPileIds = [...new Set([...destinationPileIds, ...historicalPileIds])].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        const status = lineage.activeFrontIds.includes(front.frontId) ? 'Active' as const : 'Inactive' as const
        const pileDetails = allPileIds.flatMap((pileId) => {
          const pileBatchNumbers = [...(batchesByPile.get(pileId) ?? [])].sort((left, right) => left - right)
          const rosterRevision = configurationRevisions.filter((revision) => revision.destinationPileIds.some((destination) => String(destination) === pileId)).at(-1)
          const roster = rosterRevision
            ? rosterRevision.truckIds.map(String)
            : destinationPileIds.includes(pileId)
              ? truckIds
              : [...new Set(pileBatchNumbers.flatMap((batch) => [...(recordedTrucksByFleetPileBatch.get(`${fleet.fleetId}|${pileId}|${batch}`) ?? [])]))]
          const pileStatus = status === 'Active' && destinationPileIds.includes(pileId) ? 'Active' as const : 'Inactive' as const
          return (pileBatchNumbers.length ? pileBatchNumbers : [undefined]).map((batchNumber) => ({
            pileId,
            pileStatus,
            batchNumber,
            truckIds: roster,
            recordedTruckIds: batchNumber === undefined ? new Set<string>() : (recordedTrucksByFleetPileBatch.get(`${fleet.fleetId}|${pileId}|${batchNumber}`) ?? new Set<string>()),
          }))
        })
        const excaAssignments: string[] = []
        for (const revision of [...(fleet.excaConfigurationHistory ?? [])].sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.recordedAt.getTime() - right.recordedAt.getTime())) {
          if (revision.previousExcaCode && excaAssignments.at(-1) !== revision.previousExcaCode) excaAssignments.push(revision.previousExcaCode)
          if (excaAssignments.at(-1) !== revision.excaCode) excaAssignments.push(revision.excaCode)
        }
        if (!excaAssignments.length && front.excaCode) excaAssignments.push(front.excaCode)
        const company = workspace.masterData.haulers.find((hauler) => hauler.code === front.haulerCode)?.name || (front.haulerCode as string)
        return {
          front,
          fleet,
          company,
          status,
          truckIds,
          truckCount: truckIds.length,
          destinationPileIds,
          batchNumbers,
          pileDetails,
          excaLabels: excaAssignments.slice(-2).map((excaCode) => displayExcaCode(excaCode)),
          outboundReferenceFrontIds: [...outboundReferenceFrontIds].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
          inboundReferenceFrontIds: [...inboundReferenceFrontIds].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.front.frontId.localeCompare(b.front.frontId, undefined, { numeric: true }))
  }, [fleetBatchNumbersByFleetId, recordedTrucksByFleetPileBatch, workspace.fleetSetup, workspace.masterData])
  const activeFleetCount = useMemo(
    () => fleetRows.filter((row) => row.status === 'Active').length,
    [fleetRows],
  )
  const activeFleetTruckCount = useMemo(() => {
    const lineage = deriveFrontLineage(workspace.fleetSetup)
    const activeFrontIds = new Set(lineage.activeFrontIds)
    const truckIds = new Set<string>()

    for (const fleet of workspace.fleetSetup.fleets) {
      if (!activeFrontIds.has(fleet.frontId)) continue
      const effective = resolveEffectiveFleetAgainstMaster(
        workspace.masterData,
        workspace.fleetSetup,
        fleet.fleetId,
      )
      if (!effective.ok) continue
      for (const truckId of effective.value.truckIds) truckIds.add(truckId as string)
    }

    return truckIds.size
  }, [workspace.fleetSetup, workspace.masterData])
  const registrationKey = (row: PileRegistrationDraft) => `${row.pileId}-${row.batch}`
  const togglePanel = (panel: PanelName) => {
    if (panel === 'manpower') setManpowerScrolled(false)
    setExpandedPanel((current) => (current === panel ? undefined : panel))
  }

  const selectSetupTab = (tab: SetupTab) => {
    setActiveSetupTab(tab)
    setExpandedPanel(undefined)
    setManpowerScrolled(false)
  }

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
        // WORK SETUP presents the registered Setup Trip. Production may have
        // advanced independently, so it must not replace this row's context.
        const progress = deriveSampleBatchProgress(
          row,
          workspace.masterData,
          samplePositions,
          Number(row.rit),
        )
        const complete = Boolean(
          progress && progress.producedIncrementCount >= progress.totalIncrementCount,
        )
        const displayProgress = deriveSampleDisplayProgress({
          producedBags: progress?.producedBagEquivalent ?? 0,
          deliveredBags: progress?.deliveredBagEquivalent ?? 0,
          recordedInHouseBags: row.sampleInHouse,
        })
        return {
          row,
          key: registrationKey(row),
          complete,
          progressKnown: Boolean(progress),
          displayProgress,
          // Both aggregate values are retained for the summary rather than
          // deriving one from the row's visible numerator.
          inHouseSampleCount: displayProgress.inHouseBags,
          dispatchedSampleCount: displayProgress.dispatchedBags,
        }
      }),
    [registrations, samplePositions, workspace.masterData],
  )
  const fleetToolbarSummary = useMemo(() => {
    const destinationPiles = new Set(
      fleetRows.flatMap((row) => row.destinationPileIds),
    )
    const incompleteBatchKeys = new Set(
      sampleRows
        .filter(({ complete, progressKnown }) => progressKnown && !complete)
        .map(({ row }) => `${row.pileId}-${Number(row.batch)}`),
    )
    const incompleteFleetBatchKeys = new Set<string>()
    for (const row of fleetRows) {
      for (const pile of row.pileDetails) {
        if (pile.batchNumber === undefined) continue
        const batchKey = `${pile.pileId}-${pile.batchNumber}`
        if (incompleteBatchKeys.has(batchKey)) incompleteFleetBatchKeys.add(batchKey)
      }
    }
    return {
      pileCount: destinationPiles.size,
      batchCount: incompleteFleetBatchKeys.size,
    }
  }, [fleetRows, sampleRows])
  const visibleSampleRows = useMemo(() => {
    const query = sampleQuery.trim().toLocaleLowerCase()
    const currentRows = sampleRows
    const filtered = query
      ? currentRows.filter(({ row }) =>
          `${row.pileId} ${row.oreCode} ${row.batch}`.toLocaleLowerCase().includes(query),
        )
      : currentRows
    const direction = sampleSort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((left, right) => {
      if (sampleSort.key === 'status') {
        const leftStatus = left.complete ? 0 : 1
        const rightStatus = right.complete ? 0 : 1
        return (leftStatus - rightStatus) * direction
      }
      if (sampleSort.key === 'plan') {
        const leftPlan = left.row.status === 'ACTIVE' ? 0 : 1
        const rightPlan = right.row.status === 'ACTIVE' ? 0 : 1
        const planOrder = (leftPlan - rightPlan) * direction
        if (planOrder !== 0) return planOrder
        const batchOrder = Number(left.row.batch) - Number(right.row.batch)
        if (batchOrder !== 0) return batchOrder * direction
        return String(left.row.pileId).localeCompare(String(right.row.pileId), undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * direction
      }
      if (sampleSort.key === 'sample') return (left.dispatchedSampleCount - right.dispatchedSampleCount) * direction
      const pileOrder = String(left.row.pileId).localeCompare(String(right.row.pileId), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
      if (pileOrder !== 0) return pileOrder * direction
      return (Number(left.row.batch) - Number(right.row.batch)) * direction
    })
  }, [sampleQuery, sampleRows, sampleSort])
  const toggleSampleSort = (key: SampleSortKey) =>
    setSampleSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  const visibleFleetRows = useMemo(() => {
    const query = fleetQuery.trim().toLocaleLowerCase()
    const filtered = query
      ? fleetRows.filter(({ front, fleet, truckIds }) =>
          [formatLegacyFleetLabel(front.frontId as string), front.frontId as string, fleet.fleetId as string, ...truckIds]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(query),
        )
      : fleetRows
    const direction = fleetSort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((left, right) => {
      let comparison = 0
      if (fleetSort.key === 'status') {
        comparison = left.status === right.status ? 0 : left.status === 'Active' ? -1 : 1
        if (comparison !== 0) return comparison * direction
        const fleetIdComparison = left.front.frontId.localeCompare(
          right.front.frontId,
          undefined,
          { numeric: true },
        )
        // The opening Status sort is Active-first then newest Fleet first.
        // Toggling Status reverses both directions as a manual sort.
        return fleetIdComparison * (fleetSort.direction === 'asc' ? -1 : 1)
      }
      if (fleetSort.key === 'company') comparison = left.company.localeCompare(right.company)
      if (fleetSort.key === 'truckQuantity') comparison = left.truckCount - right.truckCount
      if (fleetSort.key === 'fleet') {
        comparison = left.front.frontId.localeCompare(right.front.frontId, undefined, { numeric: true })
      }
      if (comparison !== 0) return comparison * direction
      return left.front.frontId.localeCompare(right.front.frontId, undefined, { numeric: true }) * direction
    })
  }, [fleetQuery, fleetRows, fleetSort])
  const toggleFleetSort = (key: FleetSortKey) =>
    setFleetSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  const sampleSummary = useMemo(() => {
    const currentRows = sampleRows.filter(({ key }) => !removedSampleKeys.has(key))
    const pileCount = new Set(currentRows.map(({ row }) => row.pileId)).size
    const inHouse = currentRows.reduce((total, row) => total + row.inHouseSampleCount, 0)
    const dispatched = currentRows.reduce((total, row) => total + row.dispatchedSampleCount, 0)
    return { pileCount, batchCount: currentRows.length, inHouse, dispatched }
  }, [removedSampleKeys, sampleRows])

  async function removeRegistration(row: PileRegistrationDraft) {
    setActiveSetupTab('sample')
    if (pendingSampleDelete) {
      setActionError('Undo the pending Sample removal before deleting another Sample.')
      return
    }
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
    if (pendingSampleDeleteTimer.current) clearTimeout(pendingSampleDeleteTimer.current)
    const deletedKey = registrationKey(row)
    setRemovedSampleKeys(new Set([deletedKey]))
    setPendingSampleDelete(row)
    pendingSampleDeleteTimer.current = setTimeout(() => {
      setPendingSampleDelete(undefined)
      setRemovedSampleKeys(new Set())
      pendingSampleDeleteTimer.current = undefined
      refreshWorkspace()
    }, 5_000)
    setOpenSampleActionKey(undefined)
  }

  async function undoRemoveRegistration() {
    setActiveSetupTab('sample')
    const deleted = pendingSampleDelete
    if (!deleted) return
    if (pendingSampleDeleteTimer.current) clearTimeout(pendingSampleDeleteTimer.current)
    pendingSampleDeleteTimer.current = undefined
    setPendingSampleDelete(undefined)

    const restored = await localOperationalStore.updatePileRegistrations(workspace.shiftId, [
      ...workspace.pileRegistrations.filter(
        (item) => !(item.pileId === deleted.pileId && Number(item.batch) === Number(deleted.batch)),
      ),
      deleted,
    ])
    if (!restored.ok) {
      setActionError('Unable to restore Sample Setup.')
      setPendingSampleDelete(deleted)
      return
    }
    setRemovedSampleKeys(new Set())
    refreshWorkspace()
  }

  return (
    <div data-ui="work-setup-page" className="work-setup-page flex h-full min-h-0 flex-col overflow-hidden">
      <header data-ui="setup-header" data-manpower-scrolled={manpowerExpanded && manpowerScrolled ? 'true' : undefined} className="work-setup-header safe-top shrink-0 border-y border-border">
        <h1 data-ui="work-setup-title" className="sr-only">WORK SETUP</h1>
        <div className="flex items-center border-b border-border px-[var(--space-control)] py-[var(--space-row)]">
          <span aria-label="Logo placeholder" className="type-page-title text-foreground">LOGO</span>
          <div data-ui="work-setup-status" className="ml-auto flex min-w-0 justify-end">
            <div className="min-w-0 text-right">
            <p
            data-ui="setup-online-status"
            className={`type-field-helper text-right ${online ? 'text-foreground' : 'text-warning-foreground'}`}
          >
            {online ? 'Online' : 'Offline'} · {sync.status === 'ALL_SYNCED' ? 'Synced' : 'Unsynced'}
            </p>
            <div className="flex items-center justify-end gap-1">
              <p data-ui="work-setup-version" className="type-meta text-muted-foreground">Version 1.1</p>
              <ThemeSwitcher />
            </div>
            </div>
          </div>
        </div>
        <div data-ui="setup-work-context">
          <div data-ui="setup-context-bar" className="work-setup-context grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-[var(--space-control)] py-1.5">
            <div data-ui="setup-context-left" className="min-w-0 justify-self-start text-left">
              <p data-ui="setup-context-date" className="type-section-title whitespace-nowrap leading-tight text-foreground">
                {formatShiftDateForDisplay(workspace.shift.date)}
              </p>
              <p data-ui="setup-context-shift" className="type-section-title whitespace-nowrap font-medium leading-tight text-foreground">
                <span className="font-semibold">{shiftName(workspace.shift.shiftCode)}</span>{' '}
                <span className="type-field-helper text-muted-foreground">Shift</span>
              </p>
            </div>
            <p data-ui="setup-context-location" className="type-context-value justify-self-center whitespace-nowrap text-center text-foreground">
              {workspace.shift.sectorCode} · {workspace.shift.samplingHouseCode}
            </p>
            <div data-ui="setup-context-right" className="flex min-w-0 items-center justify-self-end gap-1 text-right">
              <div data-ui="setup-context-counts" className="min-w-0">
                <p data-ui="setup-context-lead-count" className="type-field-label whitespace-nowrap leading-tight text-foreground">
                  Lead {supervisors.length}
                </p>
                <p data-ui="setup-context-crew-count" className="type-field-label whitespace-nowrap leading-tight text-foreground">
                  Crew {crew.length}
                </p>
              </div>
              {manpowerExpanded ? (
                <button
                  type="button"
                  data-ui="manpower-edit"
                  aria-label="Edit Manpower"
                  className="work-setup-manpower-edit flex size-11 shrink-0 items-center justify-center bg-focus-accent text-focus-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent"
                  onClick={() => setManpowerFormOpen(true)}
                >
                  <UserRoundCog aria-hidden="true" size={25} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div data-ui="work-setup-content" className="scrollbar-none ui-page-padding flex min-h-0 flex-1 flex-col gap-0 overflow-y-hidden">
        <section
          data-ui="manpower-panel"
          className={`ui-operational-panel shrink-0 ${personnel.length > 0 ? '' : 'border-y'}`}
        >
          {personnel.length === 0 ? (
            <p className="px-[var(--space-control)] py-1 text-sm text-foreground">No personnel assigned.</p>
          ) : (
            <div data-ui="manpower-preview">
              <div
                data-ui="manpower-list"
                className={manpowerExpanded ? 'scrollbar-none max-h-52 overflow-y-auto px-[var(--space-control)] py-1' : 'grid grid-cols-2 gap-x-[var(--space-column)] px-[var(--space-control)] py-1'}
                onScroll={manpowerExpanded ? (event) => setManpowerScrolled(event.currentTarget.scrollTop > 0) : undefined}
              >
                {manpowerExpanded ? (
                  <div data-ui="manpower-expanded-groups">
                    <div data-ui="manpower-lead-group" className="border-l-4 border-primary pl-2">
                      {columnMajorManpowerRows(supervisors).map(([left, right], rowIndex) => (
                        <div
                          key={`lead-${rowIndex}`}
                          data-ui="manpower-lead-row"
                          className="grid grid-cols-2 gap-x-[var(--space-column)]"
                        >
                          <div data-ui="manpower-lead-left" className="min-w-0">
                            {left ? (
                              <ManpowerRow
                                person={left}
                                level={staffLevelById.get(left.personId)}
                                expanded
                                checkerPersonId={workspace.checkerPersonId}
                              />
                            ) : null}
                          </div>
                          <div data-ui="manpower-lead-right" className="min-w-0">
                            {right ? (
                              <ManpowerRow
                                person={right}
                                level={staffLevelById.get(right.personId)}
                                expanded
                                checkerPersonId={workspace.checkerPersonId}
                              />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    {supervisors.length > 0 && crew.length > 0 ? (
                      <div data-ui="manpower-group-divider" className="my-1 border-t border-border" />
                    ) : null}
                    <div data-ui="manpower-crew-group" className="border-l-4 border-info pl-2">
                      {columnMajorManpowerRows(crew).map(([left, right], rowIndex) => (
                        <div
                          key={`crew-${rowIndex}`}
                          data-ui="manpower-crew-row"
                          className="grid grid-cols-2 gap-x-[var(--space-column)]"
                        >
                          <div data-ui="manpower-crew-left" className="min-w-0">
                            {left ? <ManpowerRow person={left} expanded checkerPersonId={workspace.checkerPersonId} /> : null}
                          </div>
                          <div data-ui="manpower-crew-right" className="min-w-0">
                            {right ? <ManpowerRow person={right} expanded checkerPersonId={workspace.checkerPersonId} /> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div data-ui="manpower-staff" className="pl-[var(--space-row)]">
                      {supervisors.slice(0, 3).map((person) => (
                        <ManpowerRow
                          key={person.personId}
                          person={person}
                          level={staffLevelById.get(person.personId)}
                          expanded={false}
                          checkerPersonId={workspace.checkerPersonId}
                        />
                      ))}
                    </div>
                    <div data-ui="manpower-crew" className="pl-[var(--space-column)]">
                      {crew.slice(0, 3).map((person) => (
                        <ManpowerRow key={person.personId} person={person} expanded={false} checkerPersonId={workspace.checkerPersonId} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {personnel.length > 0 ? (
            <button
              type="button"
              data-ui="manpower-expand-toggle"
              aria-label={manpowerExpanded ? 'Collapse Manpower' : 'Expand Manpower'}
              className="flex h-7 w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent"
              onClick={() => togglePanel('manpower')}
            >
              <span>{manpowerExpanded ? 'Show Less' : 'Show More'}</span>
              {manpowerExpanded ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
            </button>
          ) : null}
        </section>
        {activeSetupTab === 'sample' ? (
          <SetupPanel
          title="Sample"
          hideHeader
          uiId="sample-panel"
          Icon={SampleSafetyIcon}
          expanded={expandedPanel === 'sample'}
          hasMore={false}
          onToggle={() => togglePanel('sample')}
          fillAvailableHeight={detailPanelScrollable}
        >
          <div data-ui="sample-toolbar" className="work-setup-sample-toolbar mt-2 flex shrink-0 min-w-0 items-center gap-2 py-[var(--space-row)]">
            <div data-ui="sample-toolbar-main" className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-1 rounded-full border border-border py-1 pl-[var(--space-control)] pr-[var(--space-control)]">
              <div data-ui="sample-toolbar-search" className="min-w-[5rem] flex-1">
                <input
                  type="search"
                  aria-label="Search Sample"
                  data-ui="sample-search"
                  value={sampleQuery}
                  onChange={(event) => setSampleQuery(event.target.value)}
                  placeholder="Search Sample"
                  className="work-setup-search ui-control ui-control-compact w-full min-w-0 px-1.5 text-foreground"
                />
              </div>
              <SetupSortGroup tab="sample" sampleSort={sampleSort} fleetSort={fleetSort} onSampleSort={toggleSampleSort} onFleetSort={toggleFleetSort} />
            </div>
            <button type="button" aria-label="Add Sample" data-ui="sample-toolbar-action" className="work-setup-toolbar-action ui-button inline-flex shrink-0 items-center justify-center gap-2 bg-focus-accent text-focus-accent-foreground" onClick={() => openSampleForm()}>
              <Plus aria-hidden="true" size={22} strokeWidth={2.25} />
              <ChevronDown aria-hidden="true" size={20} strokeWidth={2.25} />
            </button>
          </div>
          <SetupSummaryTabs activeSetupTab={activeSetupTab} sampleSummary={sampleSummary} activeFleetCount={activeFleetCount} activeFleetTruckCount={activeFleetTruckCount} fleetToolbarSummary={fleetToolbarSummary} onSelect={selectSetupTab} />
          {visibleSampleRows.length === 0 ? (
            <p className="text-sm text-foreground">No Samples registered.</p>
          ) : (
            <div className={`work-setup-sample-list divide-y divide-border ${detailPanelScrollable ? 'work-setup-list-scroll scrollbar-none min-h-0 flex-1 overflow-y-auto' : ''}`}>
              {visibleSampleRows.map(({ row, key, complete, displayProgress }, index, displayedRows) => {
                if (pendingSampleDelete && key === registrationKey(pendingSampleDelete)) {
                  return (
                    <div key={key} role="status" className="flex items-center justify-between gap-3 bg-selected px-[var(--space-control)] py-[var(--space-row)] text-sm text-foreground">
                      <span className="min-w-0 truncate">Sample {row.pileId} removed</span>
                      <button
                        type="button"
                        data-ui="sample-delete-undo"
                        className="shrink-0 font-semibold text-primary"
                        onClick={() => void undoRemoveRegistration()}
                      >
                        Undo
                      </button>
                    </div>
                  )
                }
                return (
                <div
                  key={key}
                  data-ui="sample-row"
                  className="work-setup-sample-row grid grid-cols-[0px_15px_4px_13px_minmax(0,1.2fr)_15px_minmax(0,1fr)_8px_minmax(0,1fr)] items-start py-1.5"
                >
                  <span
                    aria-hidden="true"
                    data-ui="sample-material-rail"
                    className={`col-start-3 self-stretch ${row.oreCode === 'SAP' ? 'bg-ore-sap' : 'bg-ore-lim'}`}
                  />
                  <div data-ui="sample-row-pile" className="col-start-5 min-w-0">
                    <p data-ui="sample-pile" className="qps-primary-data type-operational-data break-words text-foreground">{row.pileId}</p>
                    <p className="type-field-helper mt-px break-words leading-tight">
                      <span className={row.oreCode === 'SAP' ? 'font-medium text-ore-sap-foreground' : 'font-medium text-ore-lim-foreground'}>{row.oreCode}</span>{' · '}
                      <span data-plan={row.status === 'ACTIVE' ? 'planned' : 'unplanned'} className={row.status === 'ACTIVE' ? 'font-normal text-planned-foreground' : 'font-normal text-unplanned-foreground'}>{row.status === 'ACTIVE' ? 'Planned' : 'Unplanned'}</span>
                    </p>
                  </div>
                  <div data-ui="sample-row-batch" role="group" aria-label="Batch and Trip" className="col-start-7 min-w-0 self-start">
                    <p data-ui="sample-batch-trip" className="flex items-baseline gap-1 whitespace-nowrap tabular-nums text-foreground">
                      <span className="qps-primary-data type-operational-data">{String(row.batch).padStart(2, '0')}</span>
                      <span className="type-operational-divider text-muted-foreground">/{String(row.rit).padStart(3, '0')}</span>
                    </p>
                    <p data-ui="sample-batch-status" data-complete={complete} className={`type-status mt-px break-words ${complete ? 'text-success-foreground' : 'text-warning-foreground'}`}>{complete ? 'Completed' : 'Incomplete'}</p>
                  </div>
                  <div data-ui="sample-row-sample" role="group" aria-label="Sample Progress" className="col-start-9 min-w-0 self-start text-right">
                    <p className="flex items-baseline justify-end gap-1 whitespace-nowrap tabular-nums text-foreground">
                      <span className="qps-primary-data type-operational-data">{formatSampleBagCount(displayProgress.numerator)}</span>
                      <span className="type-operational-divider text-muted-foreground">/{formatSampleBagCount(displayProgress.denominator)}</span>
                    </p>
                    <p
                      data-ui="sample-status"
                      data-status={displayProgress.status}
                      className={`type-status mt-px break-words ${displayProgress.status === 'DISPATCHED' ? 'text-success-foreground' : displayProgress.status === 'NEW_SAMPLE' ? 'text-muted-foreground' : 'text-danger'}`}
                    >
                      {displayProgress.status === 'DISPATCHED'
                        ? 'Dispatched'
                        : displayProgress.status === 'NEW_SAMPLE'
                          ? 'New Sample'
                          : 'Not Picked Up'}
                    </p>
                  </div>
                  <div data-ui="sample-menu" className="col-start-1 row-start-1 relative h-11 w-0 overflow-visible">
                    {safeRegistrationKeys.has(key) ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Sample actions for ${row.pileId} batch ${row.batch}`}
                          className="absolute left-0 top-0 flex h-11 w-11 items-center justify-start text-foreground"
                          onClick={() =>
                            setOpenSampleActionKey((current) => (current === key ? undefined : key))
                          }
                        >
                          <MoreVertical aria-hidden="true" size={17} />
                        </button>
                        {openSampleActionKey === key ? (
                          <div
                            role="menu"
                            className={`ui-action-menu absolute left-0 z-30 w-24 p-1 ${index === displayedRows.length - 1 ? 'bottom-11' : 'top-11'}`}
                          >
                            <button
                              role="menuitem"
                              type="button"
                              className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                              onClick={() => {
                                openSampleForm(row)
                                setOpenSampleActionKey(undefined)
                              }}
                            >
                              <Pencil aria-hidden="true" size={16} />
                              <span>Edit</span>
                            </button>
                            <button
                              role="menuitem"
                              type="button"
                              className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-foreground hover:bg-danger/10 focus-visible:bg-danger/10 focus-visible:outline-none"
                              onClick={() => void removeRegistration(row)}
                            >
                              <X aria-hidden="true" size={16} className="text-danger" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="block h-11 w-7" />
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </SetupPanel>
        ) : (
        <SetupPanel
          title="Fleet"
          hideHeader
          uiId="fleet-panel"
          Icon={FleetSafetyIcon}
          expanded={expandedPanel === 'fleet'}
          hasMore={false}
          onToggle={() => togglePanel('fleet')}
          fillAvailableHeight={detailPanelScrollable}
        >
          <div data-ui="fleet-toolbar" className="work-setup-fleet-toolbar mt-2 flex shrink-0 min-w-0 items-center gap-2 py-[var(--space-row)]">
            <div data-ui="sample-toolbar-main" className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-1 rounded-full border border-border py-1 pl-[var(--space-control)] pr-[var(--space-control)]">
              <div data-ui="sample-toolbar-search" className="min-w-[5rem] flex-1">
                <input
                  type="search"
                  aria-label="Search Fleet or Truck"
                  data-ui="fleet-search"
                  value={fleetQuery}
                  onChange={(event) => setFleetQuery(event.target.value)}
                  placeholder="Fleet ID / Truck ID"
                  className="work-setup-search ui-control ui-control-compact w-full min-w-0 px-1.5 text-foreground"
                />
              </div>
              <SetupSortGroup tab="fleet" sampleSort={sampleSort} fleetSort={fleetSort} onSampleSort={toggleSampleSort} onFleetSort={toggleFleetSort} />
            </div>
            <button type="button" aria-label="Add Fleet" data-ui="sample-toolbar-action" className="work-setup-toolbar-action ui-button inline-flex shrink-0 items-center justify-center gap-2 bg-focus-accent text-focus-accent-foreground" onClick={() => { setActiveSetupTab('fleet'); setFleetFormOpen(true) }}>
              <Plus aria-hidden="true" size={22} strokeWidth={2.25} />
              <ChevronDown aria-hidden="true" size={20} strokeWidth={2.25} />
            </button>
          </div>
          <SetupSummaryTabs activeSetupTab={activeSetupTab} sampleSummary={sampleSummary} activeFleetCount={activeFleetCount} activeFleetTruckCount={activeFleetTruckCount} fleetToolbarSummary={fleetToolbarSummary} onSelect={selectSetupTab} />
          {visibleFleetRows.length === 0 ? (
            <p className="text-sm text-foreground">{fleetQuery ? 'No Fleet matches this search.' : 'No Fleet registered.'}</p>
          ) : (
            <div data-ui="fleet-list" className={`work-setup-fleet-list ${detailPanelScrollable ? 'work-setup-list-scroll scrollbar-none min-h-0 flex-1 overflow-y-auto' : ''}`}>
              {visibleFleetRows.map((row) => {
                const { front, fleet, truckCount, status, company, destinationPileIds, batchNumbers, pileDetails, excaLabels, outboundReferenceFrontIds, inboundReferenceFrontIds } = row
                const fleetId = fleet.fleetId as string
                const fleetLabel = formatLegacyFleetLabel(front.frontId as string)
                const expanded = expandedFleetId === fleetId
                const toggleExpanded = () => setExpandedFleetId((current) => current === fleetId ? undefined : fleetId)
                return (
                  <Fragment key={fleetId}>
                  <article data-ui="fleet-row" data-status={status.toLowerCase()} data-expanded={expanded || undefined} className="work-setup-fleet-row overflow-hidden">
                    <header className="relative min-w-0">
                      <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} Fleet ${fleetLabel}`} aria-expanded={expanded} className="absolute inset-0 z-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent" onClick={toggleExpanded} />
                      <div className={`pointer-events-none relative z-[1] grid min-w-0 grid-cols-[3.15rem_minmax(0,1fr)_minmax(7.25rem,.82fr)] items-start gap-x-2 py-1.5 transition-all motion-reduce:transition-none ${expanded ? 'pb-1.5' : ''}`}>
                        <button type="button" data-ui="fleet-number-action" data-status-line={status.toLowerCase()} aria-label={`Fleet actions for ${fleetLabel}`} aria-haspopup="menu" aria-expanded={fleetActionPopover?.fleetId === fleetId} className={`pointer-events-auto flex min-w-0 flex-col items-end border-r-4 pr-1.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent ${status === 'Active' ? 'border-fleet-active' : 'border-fleet-inactive'}`} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setFleetActionPopover((current) => current?.fleetId === fleetId ? undefined : { fleetId, fleetLabel, mode: status === 'Active' ? 'edit' : 'reactivate', left: rect.left, top: rect.bottom + 4, width: rect.width }) }}>
                          <span data-ui="fleet-number" className={`fleet-list-number ${fleetNumberFontClass(front.frontId as string)} text-[1.625rem] leading-none tracking-normal text-foreground`}>{formatFleetNumber(front.frontId as string)}</span>
                          <span data-ui="fleet-status" className={`mt-px text-[11px] font-normal leading-tight ${status === 'Active' ? 'text-fleet-active' : 'text-fleet-inactive'}`}>{status}</span>
                        </button>
                        <div data-ui="fleet-company" className="min-w-0"><p className="qps-fleet-company break-words text-sm font-semibold leading-tight text-foreground">{formatFleetCompanyName(company)}</p><p data-ui="fleet-operational-summary" className="qps-fleet-meta mt-1 break-words text-xs leading-tight text-muted-foreground">{excaLabels.length ? excaLabels.join(' → ') : '—'} <span aria-hidden="true">·</span> <span className="font-medium text-foreground">{formatCount(truckCount, 'Truck', 'Trucks')}</span>{!expanded ? <FleetReferenceSummary outboundReferenceFrontIds={outboundReferenceFrontIds} inboundReferenceFrontIds={inboundReferenceFrontIds} /> : null}</p></div>
                        {expanded ? <div data-ui="fleet-expanded-identity" className="min-w-0 text-right"><p className="qps-fleet-full-id break-all text-xl font-bold leading-tight text-foreground">{fleet.assignmentIdentity?.fleetCode ?? front.frontId}</p><p data-ui="fleet-expanded-references" className="qps-fleet-meta mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-sm leading-tight">{outboundReferenceFrontIds.map((frontId) => <span key={`to-${frontId}`} className="font-medium text-fleet-reference-outbound">Ref to {formatFleetReference(frontId)}</span>)}{inboundReferenceFrontIds.map((frontId) => <span key={`by-${frontId}`} className="font-medium text-fleet-reference-inbound">Ref by {formatFleetReference(frontId)}</span>)}</p></div> : <div data-ui="fleet-destination" className="min-w-0 text-right"><p className="qps-primary-data qps-fleet-pile-id whitespace-nowrap text-[1.0625rem] font-bold leading-tight text-foreground">{destinationPileIds.length ? destinationPileIds.join(' · ') : 'Unassigned'}</p>{batchNumbers.length ? <p data-ui="fleet-batch-list" className="qps-fleet-meta mt-1 break-words text-xs font-normal leading-tight text-fleet-active">Batch {batchNumbers.map((batch) => String(batch).padStart(2, '0')).join(' · ')}</p> : <p data-ui="fleet-batch-empty" className="qps-fleet-meta mt-1 text-xs text-muted-foreground">No linked batch</p>}</div>}
                      </div>
                    </header>
                    <div data-ui="fleet-expand-detail" hidden={!expanded} className="ml-[3.35rem] border-t border-border pb-2 pt-1.5 transition-opacity motion-reduce:transition-none">
                      <div className="divide-y divide-border">
                        {pileDetails.length ? pileDetails.map((pile) => <div key={`${pile.pileId}-${pile.batchNumber ?? 'none'}`} data-ui="fleet-pile-batch-row" data-pile-status={pile.pileStatus.toLowerCase()} className="grid grid-cols-[4.75rem_3rem_minmax(0,1fr)] items-start gap-x-3 py-1.5">
                          <div className="min-w-0"><p data-ui="fleet-pile-id" className="qps-primary-data qps-fleet-pile-id fleet-pile-id whitespace-nowrap text-[1.0625rem] leading-tight text-foreground">{pile.pileId}</p><p className={`mt-0.5 text-[11px] font-normal ${pile.pileStatus === 'Active' ? 'text-fleet-active' : 'text-fleet-inactive'}`}>{pile.pileStatus}</p></div>
                          <div className="pt-0.5"><p className="tabular-nums text-base font-bold leading-tight text-foreground">{pile.batchNumber === undefined ? '—' : String(pile.batchNumber).padStart(2, '0')}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Batch</p></div>
                          <div data-ui="fleet-truck-matrix" className="grid grid-cols-3 gap-1 min-[24rem]:grid-cols-4">{pile.truckIds.length ? [...pile.truckIds].sort((left, right) => {
                            const recordedOrder = Number(pile.recordedTruckIds.has(right)) - Number(pile.recordedTruckIds.has(left))
                            return recordedOrder || left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
                          }).map((truckId) => {
                            const display = formatTruckDisplay(truckId)
                            const recorded = pile.recordedTruckIds.has(truckId)
                            const sameShortCode = pile.truckIds.filter((candidate) => formatTruckDisplay(candidate).compact === display.compact).length > 1
                            const label = sameShortCode ? truckId : display.compact
                            const recordedTone = pile.pileStatus === 'Active' ? 'border-fleet-active bg-blue-100 text-blue-800 dark:bg-blue-950/55 dark:text-blue-100' : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200'
                            return <span key={truckId} title={truckId} aria-label={truckId} data-recorded={recorded || undefined} data-recorded-tone={recorded ? pile.pileStatus.toLowerCase() : undefined} className={`min-w-0 whitespace-nowrap rounded border px-0.5 py-0.5 text-center text-[11px] font-medium leading-tight tabular-nums ${recorded ? recordedTone : 'border-border bg-surface text-muted-foreground'}`}>{sameShortCode ? truckId : label}</span>
                          }) : <span className="col-span-3 min-[24rem]:col-span-4 text-sm text-muted-foreground">No verifiable Truck roster.</span>}</div>
                        </div>) : <p className="py-3 text-sm text-muted-foreground">No assigned Pile.</p>}
                      </div>
                    </div>
                  </article>
                  {/* Legacy row markup deliberately kept out of the rendered tree while this active View/Expand projection replaces it.
                <div
                  key={front.frontId}
                  data-ui="fleet-row"
                  data-status={status.toLowerCase()}
                  className="work-setup-fleet-row grid grid-cols-[28px_3px_4px_8px_minmax(0,1.38fr)_8px_minmax(4.25rem,0.85fr)_8px_minmax(0,0.82fr)] items-start py-[var(--space-row)]"
                >
                  <span
                    aria-hidden="true"
                    data-ui="fleet-status-indicator"
                    className={`col-start-3 self-stretch ${status === 'Active' ? 'bg-fleet-active' : 'bg-fleet-inactive'}`}
                  />
                  <div data-ui="fleet-company" className="col-start-5 min-w-0">
                    <p className="type-field-value break-words font-semibold text-foreground">{formatFleetCompanyName(company)}</p>
                    <p className="type-status mt-0.5 break-words leading-tight">
                      <span className={status === 'Active' ? 'font-semibold text-fleet-active' : 'font-semibold text-fleet-inactive'}>{status}</span>
                      {front.excaCode ? <span className="text-muted-foreground"> {'\u00b7'} {displayExcaCode(front.excaCode)}</span> : null}
                    </p>
                  </div>
                  <div data-ui="fleet-id" className="col-start-7 min-w-0">
                    <p className="type-operational-data break-words text-foreground">{formatLegacyFleetLabel(front.frontId as string)}</p>
                    <p className="type-status mt-0.5 break-words leading-tight text-muted-foreground">
                      <span>{formatCount(truckCount, 'Truck', 'Trucks')}</span>
                      {outboundReferenceFrontIds.map((frontId) => (
                        <span key={`to-${frontId}`} className="text-fleet-reference-outbound"> {'\u00b7'} ref. to {formatLegacyFleetLabel(frontId)}</span>
                      ))}
                      {inboundReferenceFrontIds.map((frontId) => (
                        <span key={`by-${frontId}`} className="text-fleet-reference-inbound"> {'\u00b7'} ref. by {formatLegacyFleetLabel(frontId)}</span>
                      ))}
                    </p>
                  </div>
                  <div data-ui="fleet-destination" className="col-start-9 min-w-0 text-right">
                    <p className="type-operational-data break-words text-foreground">{destinationPileIds.length ? destinationPileIds.join(' · ') : 'Unassigned'}</p>
                    {batchNumbers.length > 0 ? (
                      <p
                        data-ui="fleet-batch-list"
                        className={`type-status mt-0.5 break-words leading-tight ${destinationOreCode === 'SAP' ? 'text-ore-sap-foreground' : destinationOreCode === 'LIM' ? 'text-ore-lim-foreground' : 'text-muted-foreground'}`}
                      >
                        Batch {batchNumbers.map((batch) => String(batch).padStart(2, '0')).join(' \u00b7 ')}
                      </p>
                    ) : (
                      <p data-ui="fleet-batch-empty" className="type-status mt-0.5 text-muted-foreground">No linked batch</p>
                    )}
                  </div>
                  <div data-ui="fleet-menu" className="col-start-1 row-start-1 relative h-11 w-7">
                    <button
                      type="button"
                      aria-label={`Fleet actions for ${formatLegacyFleetLabel(front.frontId as string)}`}
                      className="flex h-11 w-7 items-center justify-end text-foreground"
                      onClick={() => setOpenFleetActionId((current) => current === fleet.fleetId ? undefined : fleet.fleetId as string)}
                    >
                      <MoreVertical aria-hidden="true" size={17} />
                    </button>
                    {openFleetActionId === fleet.fleetId ? (() => {
                      if (!fleetActivityLoaded) return <div role="status" className="ui-action-menu absolute left-0 top-11 z-30 w-32 p-2 text-sm text-muted-foreground">Checking history…</div>
                      return <div role="menu" className="ui-action-menu absolute left-0 top-11 z-30 w-32 p-1">
                        <button
                          role="menuitem"
                          type="button"
                          className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          onClick={() => {
                            setOpenFleetActionId(undefined)
                            if (status === 'Active') setFleetRecordAction({ fleetId: fleet.fleetId as string, mode: 'edit' })
                            else setFleetRecordAction({ fleetId: fleet.fleetId as string, mode: 'reactivate' })
                          }}
                        >
                          <Pencil aria-hidden="true" size={16} />
                          <span>{status === 'Active' ? 'Edit Fleet' : 'Reactivation'}</span>
                        </button>
                      </div>
                    })() : null}
                  </div>
                </div>
                  */}
                  </Fragment>
                )
              })}
            </div>
          )}
        </SetupPanel>
        )}
        {actionError ? (
          <p role="alert" className="shrink-0 px-1 text-sm text-danger">
            {actionError}
          </p>
        ) : null}
      </div>

      {fleetActionPopover && typeof document !== 'undefined' ? createPortal(
        <div data-ui="fleet-action-popover" role="menu" aria-label={`Fleet actions for ${fleetActionPopover.fleetLabel}`} className="fixed z-[80] min-w-28 rounded border-2 border-border bg-surface-elevated p-0.5 shadow-lg" style={{ left: fleetActionPopover.left, top: fleetActionPopover.top, minWidth: fleetActionPopover.width }}>
          <button autoFocus role="menuitem" type="button" className="flex min-h-9 w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-semibold text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => { setFleetRecordAction({ fleetId: fleetActionPopover.fleetId, mode: fleetActionPopover.mode }); setFleetActionPopover(undefined) }}>
            {fleetActionPopover.mode === 'edit' ? <Pencil aria-hidden="true" size={15} /> : <RotateCcw aria-hidden="true" data-icon="settings_backup_restore" size={15} />}
            <span>{fleetActionPopover.mode === 'edit' ? 'Edit Fleet' : 'Reactivation'}</span>
          </button>
        </div>,
        document.body,
      ) : null}
      {manpowerFormOpen ? (
        <ActiveManpowerDialog onClose={() => setManpowerFormOpen(false)} />
      ) : null}
      {fleetFormOpen ? (
        <ActiveFleetAddSheet
          onClose={() => {
            setFleetFormOpen(false)
            setActiveSetupTab('fleet')
          }}
        />
      ) : null}
      {fleetRecordAction ? (
        <FleetRecordActionDialog
          key={`${fleetRecordAction.fleetId}:${fleetRecordAction.mode}`}
          fleetId={fleetRecordAction.fleetId}
          mode={fleetRecordAction.mode}
          onClose={() => setFleetRecordAction(undefined)}
        />
      ) : null}
      {sampleFormOpen ? (
        <div
          aria-hidden="true"
          data-ui="sample-dialog-backdrop"
          className="fixed inset-0 z-40 cursor-default bg-black/30"
        />
      ) : null}
      {sampleFormOpen ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={editingRegistration ? 'Edit Sample' : 'Add Sample'}
          data-ui="active-sample-dialog"
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
          className="active-sample-dialog fixed left-1/2 z-50 flex w-[calc(100vw-24px)] max-w-[440px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-2xl"
        >
          <div data-ui="sample-dialog-header" className="relative flex shrink-0 items-center justify-end border-b border-border px-3 py-2">
            <h2 className="type-dialog-title pointer-events-none absolute left-1/2 -translate-x-1/2 text-center text-foreground">
              {editingRegistration ? 'Edit Sample' : 'Add Sample'}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Close Sample"
                data-ui="sample-dialog-close"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent"
                onClick={closeSampleForm}
              >
                <X aria-hidden="true" size={22} />
              </button>
            </div>
          </div>
          <div data-ui="sample-dialog-body" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ActivePileRegistrationForm
              formId="active-sample-form"
              initialRegistration={editingRegistration}
              onCanSubmitChange={setSampleCanSubmit}
              onSaved={closeSampleForm}
            />
          </div>
          <div data-ui="sample-dialog-actions" className="grid shrink-0 grid-cols-2 gap-3 border-t border-border px-4 py-3">
            <button
              type="button"
              className="ui-button type-button-secondary min-h-12 rounded-[var(--radius-control)] border border-border bg-secondary-action px-4 text-foreground hover:bg-muted"
              onClick={closeSampleForm}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="active-sample-form"
              aria-label="Save Sample"
              disabled={!sampleCanSubmit}
              className="ui-button type-button-primary min-h-12 rounded-[var(--radius-control)] bg-[var(--qps-primary-action)] px-4 text-[var(--qps-primary-action-foreground)] shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
            >
              Save Sample
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
