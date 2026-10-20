import { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { createBatchPosition } from '@/domain/batch/batch-position'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition } from '@/domain/fleet/front'
import { createHaulageTransaction } from '@/domain/haulage/haulage-transaction'
import { createMasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference } from '@/domain/master/references'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureFleetId,
  fixtureFrontId,
  fixturePileId,
  fixtureShiftId,
  fixtureTransactionId,
  fixtureTruckId,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { formatFleetCompanyName, RegistrationPage } from './RegistrationPage'

vi.mock('@/app/local-operational-store', () => ({
  localOperationalStore: {
    getShiftSummarySyncRecord: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    listHaulageTransactionsForShift: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listHaulageTransactionsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listProductionRecordsForShift: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listProductionRecordsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listSamplePositionsForShift: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listSamplePositionsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    readCachedMasterData: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    updateShiftManpower: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    updatePileRegistrations: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  },
}))
vi.mock('@/app/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('@/app/hooks/useShiftSummarySyncPresentation', () => ({
  useShiftSummarySyncPresentation: () => ({
    status: 'ALL_SYNCED',
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
  }),
}))
vi.mock('@/app/google/google-master-data-sync', () => ({
  refreshAppsScriptMasterData: vi.fn().mockResolvedValue({ ok: false }),
}))

function must<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function workspace(): LocalShiftWorkspace {
  const fixtureMasterData = buildFixtureMasterData()
  const oreCode = must(parseOreCode('SAP'))
  const masterData = must(
    createMasterData({
      ...fixtureMasterData,
      pileAreas: [
        createPileAreaReference(
          fixtureMasterData.sectors[0]!.code,
          must(parsePileAreaCode('SS_01')),
          fixturePileId('S1_01'),
          oreCode,
        ),
      ],
    }),
  )
  return {
    shiftId: fixtureShiftId('SHIFT-SETUP'),
    shift: buildFixtureShift('SHIFT-SETUP'),
    piles: [],
    masterData,
    fleetSetup: buildFixtureFleetSetup(masterData),
    pendingBatches: [],
    pendingSamples: [],
    manpower: [
      { personId: 'P-2', name: 'Supervisor One', jobDeskCode: 'Supervisor', isPic: true },
      { personId: 'P-1', name: 'Checker One', jobDeskCode: 'Checker', isPic: false },
    ],
    pileRegistrations: [4, 2, 3, 1].map((batch) => ({
      pileId: fixturePileId(`S1_${String(batch).padStart(2, '0')}`),
      oreCode,
      batch: must(parseBatchNumber(batch)),
      rit: must(parseRitNumber(batch + 10)),
      status: batch === 3 ? ('INACTIVE' as const) : ('ACTIVE' as const),
    })),
  }
}

function TestActiveShell({
  workspace: workspaceValue,
  remountOnRefresh = false,
}: {
  readonly workspace: LocalShiftWorkspace
  readonly remountOnRefresh?: boolean
}) {
  const [activeWorkSetupTab, setActiveWorkSetupTab] = useState<'sample' | 'fleet'>('fleet')
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  useEffect(() => {
    const openFleet = () => setActiveWorkSetupTab('fleet')
    window.addEventListener('work-setup:open-fleet', openFleet)
    return () => window.removeEventListener('work-setup:open-fleet', openFleet)
  }, [])
  const context: ActiveWorkspaceContext = {
    workspace: workspaceValue,
    refreshWorkspace: () => {
      if (remountOnRefresh) setWorkspaceVersion((version) => version + 1)
    },
    activeWorkSetupTab,
    setActiveWorkSetupTab,
  }
  return <Outlet key={workspaceVersion} context={context} />
}

function renderPage(workspaceValue = workspace(), remountOnRefresh = false) {
  return render(
    <MemoryRouter initialEntries={['/regist']}>
      <Routes>
        <Route element={<TestActiveShell workspace={workspaceValue} remountOnRefresh={remountOnRefresh} />}>
          <Route path="/regist" element={<RegistrationPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function workspaceWithFleetReferenceChain(): LocalShiftWorkspace {
  const workspaceValue = workspace()
  const sector = must(parseSectorCode('S1'))
  const hauler = must(parseHaulerCode('H1'))
  const destination = fixturePileId('S1_01')
  const frontOne = createFrontDefinition(fixtureFrontId('F1'), sector, hauler, destination)
  const frontTwo = createFrontDefinition(fixtureFrontId('F2'), sector, hauler, destination)
  const frontThree = createFrontDefinition(fixtureFrontId('F3'), sector, hauler, destination)
  const baseFleet = must(createBaseFleetDefinition({
    fleetId: fixtureFleetId('FLEET-A'),
    frontId: frontOne.frontId,
    truckIds: [fixtureTruckId('T1')],
  }))
  const derivedFleet = must(createDerivedFleetDefinition({
    fleetId: fixtureFleetId('FLEET-B'),
    frontId: frontTwo.frontId,
    referenceFleetId: baseFleet.fleetId,
    addedTruckIds: [fixtureTruckId('T2')],
    removedTruckIds: [],
  }))
  const activeFleet = must(createDerivedFleetDefinition({
    fleetId: fixtureFleetId('FLEET-C'),
    frontId: frontThree.frontId,
    referenceFleetId: derivedFleet.fleetId,
    addedTruckIds: [],
    removedTruckIds: [],
  }))
  return {
    ...workspaceValue,
    fleetSetup: must(createFleetSetup({
      fronts: [frontOne, frontTwo, frontThree],
      fleets: [baseFleet, derivedFleet, activeFleet],
    }, workspaceValue.masterData)),
    pileRegistrations: [{
      pileId: destination,
      oreCode: must(parseOreCode('SAP')),
      batch: must(parseBatchNumber(1)),
      rit: must(parseRitNumber(1)),
      status: 'ACTIVE',
    }],
  }
}

describe('RegistrationPage active-shift Setup', () => {
  it('formats a leading PT prefix for Fleet list display only', () => {
    expect(formatFleetCompanyName('PT Hillconjaya Sukses')).toBe('Hillconjaya Sukses')
    expect(formatFleetCompanyName('pt Rajawali Emas Ancora Lestari')).toBe('Rajawali Emas Ancora Lestari')
    expect(formatFleetCompanyName('Operator PT Tengah')).toBe('Operator PT Tengah')
  })

  it('shows the three panels, read-only status, and no inline active-shift add controls', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    expect(screen.getByRole('tab', { name: 'Sample' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Fleet' })).toBeInTheDocument()
    expect(screen.getByText(/Online/)).toBeInTheDocument()
    expect(screen.queryByText('Work location')).not.toBeInTheDocument()
    expect(screen.queryByText('Last sync')).not.toBeInTheDocument()
    expect(screen.getByText('S1 · HOUSE-1')).toBeInTheDocument()
    expect(screen.getByText('04-Sept-2026')).toBeInTheDocument()
    expect(screen.getByText('Day')).toHaveClass('font-semibold')
    expect(screen.getByText('Shift')).toHaveClass('type-field-helper', 'text-muted-foreground')
    expect(container.querySelector('[data-ui="setup-header"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="work-setup-page"]')).toHaveClass('work-setup-page')
    expect(screen.getByText('WORK SETUP')).toHaveClass('sr-only')
    expect(container.querySelector('[data-ui="work-setup-status"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="work-setup-version"]')).toHaveTextContent('Version 1.1')
    expect(container.querySelector('[data-ui="work-setup-status"] button[aria-label="Settings"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="setup-work-context"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="setup-context-bar"]')).toHaveClass('work-setup-context')
    expect(container.querySelector('[data-ui="setup-context-left"]')).toContainElement(container.querySelector('[data-ui="setup-context-date"]'))
    expect(container.querySelector('[data-ui="setup-context-left"]')).toContainElement(container.querySelector('[data-ui="setup-context-shift"]'))
    expect(container.querySelector('[data-ui="setup-context-counts"]')).toContainElement(container.querySelector('[data-ui="setup-context-lead-count"]'))
    expect(container.querySelector('[data-ui="setup-context-counts"]')).toContainElement(container.querySelector('[data-ui="setup-context-crew-count"]'))
    expect(container.querySelector('[data-ui="setup-context-date"]')).toHaveClass('type-section-title')
    expect(container.querySelector('[data-ui="setup-context-location"]')).toHaveClass('type-context-value')
    expect(container.querySelector('[data-ui="setup-context-lead-count"]')).toHaveTextContent('Lead 1')
    expect(container.querySelector('[data-ui="setup-context-crew-count"]')).toHaveTextContent('Crew 1')
    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).toHaveTextContent('Show More')
    expect(screen.queryByRole('button', { name: 'Edit Manpower' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="work-setup-content"]')).toHaveClass('flex-1', 'min-h-0', 'gap-0', 'overflow-y-hidden')
    expect(screen.queryByRole('button', { name: '+ Manpower' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Sample' })).not.toBeInTheDocument()
    expect(screen.getByTestId('manpower-row-P-1')).not.toHaveClass('grid-cols-[3px_18px_minmax(0,1fr)]')
    expect(screen.getByTestId('manpower-row-P-1').querySelector('p')).toHaveClass('type-field-value', 'break-words', 'font-medium')
    expect(screen.queryByLabelText('Checker')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-checker-role"]')).toHaveTextContent('Checker')
    expect(container.querySelector('[data-ui="manpower-checker-role"]')).toHaveClass('rounded-full', 'border-[var(--work-setup-tab-active-underline)]', 'bg-[var(--work-setup-tab-active)]', 'text-[10px]', 'text-foreground')
    expect(container.querySelector('[data-ui="manpower-header"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-add"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Fleet' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    const sampleRow = screen.getByText('S1_01').closest('[class*="grid-cols"]')
    expect(sampleRow).toHaveClass('grid-cols-[0px_15px_4px_13px_minmax(0,1.2fr)_15px_minmax(0,1fr)_8px_minmax(0,1fr)]')
    expect(sampleRow).toHaveClass('work-setup-sample-row', 'py-1.5')
    expect(container.querySelector('[data-ui="sample-menu"]')).toHaveClass('col-start-1', 'row-start-1', 'w-0')
    expect(container.querySelector('[data-ui="sample-menu"] button')).toHaveClass('absolute', 'left-0', 'top-0', 'h-11', 'w-11', 'justify-start')
    expect(container.querySelector('[data-ui="sample-menu"] svg')).not.toHaveClass('-translate-x-[8px]')
    expect(container.querySelector('[data-ui="sample-material-rail"]')).toHaveClass('col-start-3')
    expect(container.querySelector('[data-ui="sample-row-pile"]')).toHaveClass('col-start-5')
    expect(container.querySelector('[data-ui="sample-row-batch"]')).toHaveClass('col-start-7')
    expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveClass('col-start-9')
    expect(sampleRow).toHaveTextContent('01')
    expect(container.querySelector('.work-setup-sample-list')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-pile"]')).toHaveClass('qps-primary-data', 'type-operational-data')
    expect(container.querySelector('[data-ui="sample-batch-trip"] span')).toHaveClass('qps-primary-data')
    expect(container.querySelector('[data-ui="sample-row-sample"] span')).toHaveClass('qps-primary-data')
    expect(container.querySelector('[data-ui="sample-batch-trip"] .type-operational-divider')).not.toHaveClass('qps-primary-data')
    expect(container.querySelector('[data-ui="sample-row-pile"] .type-field-helper')).toHaveClass('mt-px')
    expect(container.querySelector('[data-ui="sample-batch-status"]')).toHaveClass('mt-px')
    expect(container.querySelector('[data-ui="sample-status"]')).toHaveClass('mt-px')
    expect(screen.getAllByText('Planned')[0]).toHaveClass('font-normal', 'text-planned-foreground')
    expect(screen.getAllByText('Unplanned')[0]).toHaveClass('font-normal', 'text-unplanned-foreground')
    expect(container.querySelector('[data-ui="sample-batch-trip"] .type-operational-divider')).toHaveClass('text-muted-foreground')
    expect(container.querySelector('[data-ui="sample-batch-status"]')).toHaveClass('type-status')
    expect(container.querySelector('[data-ui="sample-status"]')).toHaveClass('type-status')
    expect(container.querySelector('[data-ui="sample-row-batch"]')).toHaveAttribute('role', 'group')
    expect(container.querySelector('[data-ui="sample-row-batch"]')).toHaveAttribute('aria-label', 'Batch and Trip')
    expect(container.querySelector('[data-ui="sample-row-batch"]')).toHaveClass('self-start')
    expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveAttribute('role', 'group')
    expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveAttribute('aria-label', 'Sample Progress')
    expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveClass('self-start', 'text-right')
    expect(container.querySelector('[data-ui="sample-row-batch"] > span')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-row-sample"] > span')).not.toBeInTheDocument()
    for (const dataUi of ['manpower-panel', 'manpower-preview', 'manpower-list', 'sample-fleet-tabbar', 'sample-fleet-sortbar', 'sample-toolbar-main', 'sample-toolbar-summary-primary', 'sample-panel', 'sample-toolbar', 'sample-toolbar-summary-secondary', 'sample-toolbar-search', 'sample-search', 'sample-toolbar-action', 'sample-row-pile', 'sample-row-batch', 'sample-row-sample', 'sample-pile', 'sample-batch-trip', 'sample-batch-status', 'sample-status', 'sample-menu', 'setup-tabs', 'setup-sample-tab', 'setup-fleet-tab']) {
      expect(container.querySelector(`[data-ui="${dataUi}"]`)).toBeInTheDocument()
    }
    expect(container.querySelector('[data-ui="sample-fleet-tabbar"]')).toHaveClass('work-setup-tabs', 'flex', 'pr-0')
    expect(container.querySelector('[data-ui="sample-fleet-tabbar"]')).toContainElement(container.querySelector('[data-ui="sample-fleet-summary"]'))
    expect(container.querySelector('[data-ui="setup-tabs"]')).toHaveClass('grid', 'shrink-0')
    const sampleToolbar = container.querySelector('[data-ui="sample-toolbar"]')
    const sampleFleetTabbar = container.querySelector('[data-ui="sample-fleet-tabbar"]')
    expect(sampleToolbar).toBeInTheDocument()
    expect(sampleFleetTabbar).toBeInTheDocument()
    if (!sampleToolbar || !sampleFleetTabbar) throw new Error('Sample toolbar and tabbar must render before their DOM order is checked.')
    expect(sampleToolbar.compareDocumentPosition(sampleFleetTabbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('[data-ui="sample-fleet-summary"]')).toHaveClass('gap-4')
    expect(container.querySelector('[data-ui="sample-fleet-tabbar"]')).not.toContainElement(container.querySelector('[data-ui="sample-fleet-sortbar"]'))
    expect(container.querySelector('[data-ui="sample-search"]')).toHaveClass('work-setup-search')
    expect(container.querySelector('[data-ui="sample-toolbar"]')).toHaveClass('work-setup-sample-toolbar', 'mt-2', 'flex')
    expect(container.querySelector('[data-ui="sample-toolbar"]')).not.toHaveClass('border-y')
    expect(container.querySelector('[data-ui="sample-fleet-sortbar"]')).toHaveAttribute('role', 'group')
    expect(container.querySelector('[data-ui="sample-toolbar"]')).toContainElement(container.querySelector('[data-ui="sample-fleet-sortbar"]'))
    expect(container.querySelector('[data-ui="sample-toolbar-main"]')).toHaveClass('rounded-full', 'flex-1')
    expect(container.querySelector('[data-ui="sample-toolbar-summary-primary"]')).toHaveClass('font-bold')
    expect(container.querySelector('[data-ui="sample-toolbar-summary-secondary"]')).toHaveClass('shrink-0', 'whitespace-nowrap', 'font-bold')
    expect(container.querySelector('[data-ui="sample-toolbar-search"]')).toHaveClass('min-w-[5rem]', 'flex-1')
    const toolbarMain = container.querySelector('[data-ui="sample-toolbar-main"]')
    expect(toolbarMain).toBeInTheDocument()
    expect(Array.from(toolbarMain!.children).map((child) => child.getAttribute('data-ui'))).toEqual(['sample-toolbar-search', 'sample-fleet-sortbar'])
    expect(container.querySelector('[data-ui="sample-fleet-summary"]')).toContainElement(container.querySelector('[data-ui="sample-toolbar-summary-primary"]'))
    expect(container.querySelector('[data-ui="sample-fleet-summary"]')).toContainElement(container.querySelector('[data-ui="sample-toolbar-summary-secondary"]'))
    expect(container.querySelector('[data-ui="sample-search"]')).toHaveClass('min-w-0', 'w-full')
    expect(screen.getByRole('button', { name: /Sort Status Completed and Incomplete/i })).toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-staff"]')).toHaveClass('pl-[var(--space-row)]')
    expect(screen.getAllByText('Not Picked Up').length).toBeGreaterThan(0)

    const setupIcons = Array.from(container.querySelectorAll('svg[data-icon$="-safety"]'))
    expect(setupIcons.map((icon) => icon.getAttribute('data-icon'))).toEqual([])
    for (const icon of setupIcons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('width', '24')
      expect(icon).toHaveAttribute('height', '24')
      expect(icon).toHaveAttribute('stroke-width', '1.8')
      expect(icon).toHaveClass('text-primary')
    }

    const panels = Array.from(container.querySelectorAll('section'))
    expect(panels).toHaveLength(2)
    expect(panels.every((panel) => panel.classList.contains('ui-operational-panel'))).toBe(true)
    expect(panels.some((panel) => panel.classList.contains('shrink-0'))).toBe(true)
    expect(panels.some((panel) => panel.classList.contains('flex-1'))).toBe(true)
  })

  it('renders expanded Manpower in separate column-major Lead and Crew groups', async () => {
    const user = userEvent.setup()
    const currentWorkspace = workspace()
    const { container } = renderPage({
      ...currentWorkspace,
      manpower: [
        ...Array.from({ length: 7 }, (_, index) => ({
          personId: `L-${index + 1}`,
          name: `Lead ${index + 1}`,
          jobDeskCode: 'Supervisor',
          isPic: true,
        })),
        { personId: 'C-1', name: 'Checker One', jobDeskCode: 'Checker', isPic: false },
        { personId: 'C-2', name: 'Sampler One', jobDeskCode: 'Sampler', isPic: false },
        { personId: 'C-3', name: 'Crew One', jobDeskCode: 'Crew', isPic: false },
      ],
    })
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    expect(container.querySelector('[data-ui="manpower-header"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-add"]')).not.toBeInTheDocument()
    expect(screen.getAllByTestId(/manpower-row-/)).toHaveLength(6)
    expect(screen.queryByTestId('manpower-row-L-4')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))

    const editManpower = screen.getByRole('button', { name: 'Edit Manpower' })
    expect(editManpower).toHaveClass('size-11', 'bg-focus-accent')
    await user.click(editManpower)
    expect(screen.getByRole('dialog', { name: 'Edit Manpower' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Edit Manpower' }))

    expect(container.querySelector('[data-ui="manpower-header"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-add"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-expanded-groups"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-list"]')).not.toHaveClass('grid-cols-2')

    const leadRows = Array.from(container.querySelectorAll('[data-ui="manpower-lead-row"]'))
    expect(leadRows).toHaveLength(4)
    expect(leadRows[0]).toHaveTextContent('Lead 1')
    expect(leadRows[0]).toHaveTextContent('Lead 5')
    expect(leadRows[1]).toHaveTextContent('Lead 2')
    expect(leadRows[1]).toHaveTextContent('Lead 6')
    expect(leadRows[2]).toHaveTextContent('Lead 3')
    expect(leadRows[2]).toHaveTextContent('Lead 7')
    expect(leadRows[3]).toHaveTextContent('Lead 4')
    expect(leadRows[3]?.querySelector('[data-ui="manpower-lead-right"]')).toBeEmptyDOMElement()
    expect(leadRows[3]).not.toHaveTextContent('Checker One')

    const crewRows = Array.from(container.querySelectorAll('[data-ui="manpower-crew-row"]'))
    expect(crewRows).toHaveLength(2)
    expect(crewRows[0]).toHaveTextContent('Checker One')
    expect(crewRows[0]).toHaveTextContent('Checker')
    expect(crewRows[0].querySelectorAll('[data-ui="manpower-checker-role"]')).toHaveLength(1)
    expect(crewRows[0].querySelector('[data-ui="manpower-checker-role"]')).toHaveClass('font-bold', 'rounded-full')
    expect(crewRows[0]).toHaveTextContent('Crew One')
    expect(crewRows[1]).toHaveTextContent('Sampler One')
    expect(crewRows[1]?.querySelector('[data-ui="manpower-crew-right"]')).toBeEmptyDOMElement()
    expect(container.querySelector('[data-ui="manpower-group-divider"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-lead-group"]')).toHaveClass('border-l-4', 'border-primary')
    expect(container.querySelector('[data-ui="manpower-crew-group"]')).toHaveClass('border-l-4', 'border-info')

    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).toHaveClass('h-7', 'text-muted-foreground')
    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).not.toHaveClass('border-t', 'border-b', 'bg-[var(--work-setup-panel)]')
    expect(container.querySelector('[data-ui="manpower-expand-toggle"]')).toHaveTextContent('Show Less')
    expect(container.querySelector('[data-ui="manpower-panel"]')).not.toHaveClass('border-y', 'border-b')
    expect(container.querySelector('[data-ui="sample-fleet-tabbar"]')).not.toHaveClass('border-b', 'mt-2', 'border-y')
    expect(container.querySelector('[data-ui="manpower-list"]')).toHaveClass('scrollbar-none', 'max-h-52', 'overflow-y-auto')
    expect(container.querySelector('.ui-page-padding')).toHaveClass('overflow-y-hidden')
    expect(container.querySelector('[data-ui="sample-panel"]')).toHaveClass('flex-1', 'min-h-0')
    expect(container.querySelector('.work-setup-sample-list')).toHaveClass('scrollbar-none', 'flex-1', 'overflow-y-auto')

    const manpowerList = container.querySelector('[data-ui="manpower-list"]') as HTMLDivElement
    Object.defineProperty(manpowerList, 'scrollTop', { configurable: true, value: 12 })
    fireEvent.scroll(manpowerList)
    expect(container.querySelector('[data-ui="setup-header"]')).toHaveAttribute('data-manpower-scrolled', 'true')

    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    expect(screen.getByRole('button', { name: 'Expand Manpower' })).toBeInTheDocument()
    expect(container.querySelector('[data-ui="setup-header"]')).not.toHaveAttribute('data-manpower-scrolled')

    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))
    await user.click(screen.getByRole('button', { name: 'Collapse Manpower' }))
    expect(container.querySelector('[data-ui="manpower-header"]')).not.toBeInTheDocument()
  })

  it('places a Crew Checker first beneath Staff and renders one bold Checker badge', async () => {
    const user = userEvent.setup()
    const currentWorkspace = workspace()
    const { container } = renderPage({
      ...currentWorkspace,
      checkerPersonId: 'C-9',
      manpower: [
        { personId: 'L-1', name: 'Staff One', jobDeskCode: 'Supervisor', isPic: true },
        { personId: 'C-1', name: 'Crew One', jobDeskCode: 'Sampler', isPic: false },
        { personId: 'C-9', name: 'Crew Checker', jobDeskCode: 'Sampler', isPic: false },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))

    const crewRows = Array.from(container.querySelectorAll('[data-ui="manpower-crew-group"] [data-testid^="manpower-row-"]'))
    expect(crewRows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'manpower-row-C-9',
      'manpower-row-C-1',
    ])
    expect(crewRows[0]?.querySelectorAll('[data-ui="manpower-checker-role"]')).toHaveLength(1)
    expect(crewRows[0]?.querySelector('[data-ui="manpower-checker-role"]')).toHaveClass('font-bold')
  })

  it('switches Sample and Fleet through the compact right-aligned tabs', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 })
    const { container } = renderPage()
    expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Fleet' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Fleet actions for F1' })).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-toolbar-summary-primary"]')).toHaveTextContent('1 Fleet · 1 Truck')
    expect(container.querySelector('[data-ui="fleet-panel"] [data-ui="fleet-toolbar"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-toolbar-summary-secondary"]')).toHaveTextContent('0 Piles · 0 Batches')
    expect(container.querySelector('[data-ui="fleet-search"]')).toHaveAttribute('placeholder', 'Fleet ID / Truck ID')
    expect(container.querySelector('[data-ui="fleet-list"]')).toHaveClass('work-setup-list-scroll', 'overflow-y-auto')
    expect(screen.getByText('Show More')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-fleet-sortbar"]')).toHaveAttribute('role', 'group')
    expect(container.querySelector('[data-ui="fleet-sort-status"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-sort-company"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-sort-id"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-sort-truck-quantity"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-row"]')).toHaveClass('overflow-hidden')
    expect(container.querySelector('[data-ui="fleet-menu"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-number-action"]')).toHaveClass('border-r-4')
    expect(container.querySelector('[data-ui="fleet-number-action"]')).toHaveAttribute('data-status-line', 'active')
    expect(container.querySelector('[data-ui="fleet-number-action"]')).toHaveClass('border-fleet-active', 'pr-1.5', 'items-end', 'text-right')
    expect(container.querySelector('[data-ui="fleet-number"]')).toHaveClass('fleet-list-number', 'text-[1.625rem]', 'tracking-normal')
    expect(container.querySelector('[data-ui="fleet-number"]')).toHaveClass('qps-fleet-number--odd')
    expect(container.querySelector('[data-ui="fleet-number"]')).not.toHaveClass('tabular-nums')
    expect(container.querySelector('[data-ui="fleet-status"]')).toHaveClass('text-[11px]', 'font-normal')
    expect(container.querySelector('[data-ui="fleet-company"]')).toHaveTextContent('H1')
    expect(container.querySelector('[data-ui="fleet-company"] .qps-fleet-company')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="fleet-operational-summary"]')).toHaveClass('qps-fleet-meta')
    expect(container.querySelector('[data-ui="fleet-operational-summary"]')).toHaveTextContent('1 Truck')
    expect(container.querySelector('[data-ui="fleet-batch-empty"]')).toHaveClass('qps-fleet-meta')
    expect(container.querySelector('[data-ui="fleet-batch-empty"]')).toHaveTextContent('No linked batch')
    const fleetSearch = screen.getByLabelText('Search Fleet or Truck')
    await user.type(fleetSearch, 'T1')
    expect(screen.getByRole('button', { name: 'Fleet actions for F1' })).toBeInTheDocument()
    await user.clear(fleetSearch)
    await user.click(screen.getByRole('button', { name: 'Sort Company ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Company asc' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Sort Company asc' }))
    expect(screen.getByRole('button', { name: 'Sort Company desc' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Sort Status Active and Inactive ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Status Active and Inactive asc' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Sort Fleet ID ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Fleet ID asc' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Sort Truck Quantity ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Truck Quantity asc' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(fleetSearch, 'missing-fleet')
    expect(screen.getByText('No Fleet matches this search.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    expect(container.querySelector('[data-ui="sample-panel"]')).toBeInTheDocument()
    expect(
      Array.from(container.querySelectorAll('[data-ui="sample-fleet-sortbar"] > button')).map((button) => button.getAttribute('data-ui')),
    ).toEqual([
      'sample-sort-plan',
      'sample-sort-batch',
      'sample-sort-status',
      'sample-sort-sample',
    ])
    expect(container.querySelector('[data-ui="sample-sort-plan"] svg')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-sort-status"] svg')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sort Status Completed and Incomplete ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Status Completed and Incomplete asc' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('[data-ui="sample-sort-plan"] svg')).not.toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-sort-status"] svg')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))
    expect(screen.getByRole('button', { name: 'Collapse Manpower' })).toHaveTextContent('Show Less')
    expect(container.querySelector('.work-setup-sample-list')).toHaveClass(
      'work-setup-list-scroll',
      'overflow-y-auto',
    )
    expect(container.querySelector('.ui-page-padding')).toHaveClass('overflow-y-hidden')
  })

  it('defaults to Fleet, preserves a manual Sample selection through rerenders, and resets to Fleet from SETUP navigation', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    expect(screen.queryByRole('dialog', { name: 'Add Sample' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add Fleet' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Search Sample'), 'S1')
    expect(container.querySelector('[data-ui="sample-panel"]')).toBeInTheDocument()

    window.dispatchEvent(new CustomEvent('work-setup:open-fleet'))
    await waitFor(() => expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument())
    expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Fleet' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Add Fleet' })).not.toBeInTheDocument()
  })

  it('returns to Fleet after Add Fleet is cancelled', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    await user.click(screen.getByRole('button', { name: 'Add Fleet' }))
    expect(screen.getByRole('dialog', { name: 'Add Fleet' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(container.querySelector('[data-ui="fleet-panel"]')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Fleet' })).toHaveAttribute('aria-selected', 'true')
  })

  it('presents Fleet lineage, explicit Fleet batches, and active/inactive state without borrowing batches by Pile', async () => {
    const user = userEvent.setup()
    const baseWorkspace = workspaceWithFleetReferenceChain()
    const workspaceValue: LocalShiftWorkspace = {
      ...baseWorkspace,
      pileRegistrations: [
        ...baseWorkspace.pileRegistrations,
        {
          pileId: fixturePileId('S1_01'),
          oreCode: must(parseOreCode('SAP')),
          batch: must(parseBatchNumber(2)),
          rit: must(parseRitNumber(1)),
          status: 'ACTIVE',
        },
      ],
    }
    const linkedTransaction = buildFixtureHaulageTransaction({
      id: 'FLEET-BATCH-1',
      shiftId: 'SHIFT-SETUP',
      pile: buildFixtureSapPile('S1_01'),
      batch: 1,
      rit: 1,
      masterData: workspaceValue.masterData,
      fleetSetup: workspaceValue.fleetSetup,
    })
    const activeLinkedTransaction = must(createHaulageTransaction({
      id: fixtureTransactionId('FLEET-BATCH-2'),
      shiftId: fixtureShiftId('SHIFT-SETUP'),
      pile: buildFixtureSapPile('S1_01'),
      batchPosition: createBatchPosition(must(parseBatchNumber(1)), must(parseRitNumber(2))),
      fleetId: fixtureFleetId('FLEET-C'),
      truckId: fixtureTruckId('T2'),
      masterData: workspaceValue.masterData,
      fleetSetup: workspaceValue.fleetSetup,
    }))
    const inactiveLinkedTransaction = buildFixtureHaulageTransaction({
      id: 'FLEET-BATCH-3',
      shiftId: 'SHIFT-SETUP',
      pile: buildFixtureSapPile('S1_01'),
      batch: 2,
      rit: 1,
      masterData: workspaceValue.masterData,
      fleetSetup: workspaceValue.fleetSetup,
    })
    vi.mocked(localOperationalStore.listHaulageTransactionsForShift).mockResolvedValue({
      ok: true,
      value: [linkedTransaction, activeLinkedTransaction, inactiveLinkedTransaction],
    })

    const { container } = renderPage(workspaceValue)
    await waitFor(() => expect(screen.getByText('Batch 01 · 02')).toBeInTheDocument())

    const fleetOne = screen.getByRole('button', { name: 'Fleet actions for F1' }).closest('[data-ui="fleet-row"]')
    const fleetTwo = screen.getByRole('button', { name: 'Fleet actions for F2' }).closest('[data-ui="fleet-row"]')
    const fleetThree = screen.getByRole('button', { name: 'Fleet actions for F3' }).closest('[data-ui="fleet-row"]')
    expect(fleetOne).toHaveAttribute('data-status', 'inactive')
    expect(fleetOne?.querySelector('[data-ui="fleet-number"]')).toHaveClass('qps-fleet-number--odd')
    expect(fleetOne?.querySelector('[data-ui="fleet-number-action"]')).toHaveTextContent('Inactive')
    expect(fleetOne).toHaveTextContent('H1')
    expect(fleetOne).toHaveTextContent('Batch 01 · 02')
    expect(fleetOne?.querySelector('[data-ui="fleet-reference-inbound"]')).toHaveTextContent('Ref by F02')
    expect(fleetOne?.querySelector('[data-ui="fleet-reference-inbound"]')).toHaveClass('text-fleet-reference-inbound')
    expect(fleetTwo).toHaveTextContent('Ref: to F01 · by F03')
    expect(fleetTwo?.querySelector('[data-ui="fleet-number"]')).toHaveClass('qps-fleet-number--even')
    expect(fleetTwo?.querySelector('[data-ui="fleet-reference-outbound"]')).toHaveClass('text-fleet-reference-outbound')
    expect(fleetTwo?.querySelector('[data-ui="fleet-reference-inbound"]')).toHaveClass('text-fleet-reference-inbound')
    expect(fleetTwo?.querySelector('[data-ui="fleet-batch-empty"]')).toHaveTextContent('No linked batch')
    expect(fleetThree).toHaveAttribute('data-status', 'active')
    expect(fleetThree?.querySelector('[data-ui="fleet-number"]')).toHaveClass('qps-fleet-number--odd')
    expect(fleetThree?.querySelector('[data-ui="fleet-number-action"]')).toHaveTextContent('Active')
    expect(fleetThree?.querySelector('[data-ui="fleet-reference-outbound"]')).toHaveTextContent('Ref to F02')
    expect(fleetThree?.querySelector('[data-ui="fleet-reference-outbound"]')).toHaveClass('text-fleet-reference-outbound')
    expect(fleetThree).toHaveTextContent('Batch 01')
    expect(Array.from(container.querySelectorAll('[data-ui="fleet-row"] [data-ui="fleet-number-action"]')).map((row) => row.getAttribute('aria-label'))).toEqual(['Fleet actions for F3', 'Fleet actions for F2', 'Fleet actions for F1'])
    expect(container.querySelector('[data-ui="fleet-toolbar-summary-primary"]')).toHaveTextContent('1 Fleet · 2 Trucks')
    expect(container.querySelector('[data-ui="fleet-toolbar-summary-secondary"]')).toHaveTextContent('1 Pile · 2 Batches')
    expect(screen.getByRole('button', { name: 'Fleet actions for F3' })).toBeInTheDocument()

    const search = screen.getByLabelText('Search Fleet or Truck')
    await user.type(search, 'F3')
    expect(screen.getByRole('button', { name: 'Fleet actions for F3' })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'T2')
    expect(screen.getByRole('button', { name: 'Fleet actions for F2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fleet actions for F3' })).toBeInTheDocument()

    vi.mocked(localOperationalStore.listHaulageTransactionsForShift).mockResolvedValue({ ok: true, value: [] })
  })

  it('keeps one Sample sort active and toggles its direction', async () => {
    const user = userEvent.setup()
    renderPage(workspace(), true)
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    const planSort = screen.getByRole('button', { name: 'Sort Planned and Unplanned asc' })
    expect(planSort).toHaveAttribute('aria-pressed', 'true')
    await user.click(planSort)
    expect(screen.getByRole('button', { name: 'Sort Planned and Unplanned desc' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Sort Batch ascending' }))
    expect(screen.getByRole('button', { name: 'Sort Batch asc' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sort Planned and Unplanned ascending' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens the Fleet action popover before Edit Fleet', async () => {
    const user = userEvent.setup()
    vi.mocked(localOperationalStore.listProductionRecordsForShift).mockResolvedValue({ ok: true, value: [] })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Add setup item' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Fleet' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))
    expect(screen.queryByRole('dialog', { name: 'Edit Fleet F1' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Fleet actions for F1' })).toHaveClass('border-2', 'p-0.5')
    expect(screen.getByRole('menuitem', { name: 'Edit Fleet' }).querySelector('svg')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Edit Fleet' }))
    expect(screen.getByRole('dialog', { name: 'Edit Fleet F1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Fleet action' }))
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    expect(screen.getByRole('button', { name: 'Add Sample' })).toBeInTheDocument()
  })

  it('closes the Fleet action popover on Escape and outside press', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))
    expect(screen.getByRole('menu', { name: 'Fleet actions for F1' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Fleet actions for F1' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))
    await user.click(screen.getByLabelText('Search Fleet or Truck'))
    expect(screen.queryByRole('menu', { name: 'Fleet actions for F1' })).not.toBeInTheDocument()
  })

  it('uses the reactivation mini action for an inactive Fleet without expanding its row', async () => {
    const user = userEvent.setup()
    renderPage(workspaceWithFleetReferenceChain())
    const inactiveRow = screen.getByRole('button', { name: 'Fleet actions for F1' }).closest('[data-ui="fleet-row"]')

    expect(inactiveRow?.querySelector('[data-ui="fleet-number-action"]')).toHaveAttribute('data-status-line', 'inactive')
    expect(inactiveRow?.querySelector('[data-ui="fleet-number-action"]')).toHaveClass('border-fleet-inactive')
    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))

    expect(inactiveRow).not.toHaveAttribute('data-expanded')
    expect(screen.getByRole('menuitem', { name: 'Reactivation' }).querySelector('[data-icon="settings_backup_restore"]')).toBeInTheDocument()
  })

  it('uses blue recorded truck fills for active and inactive Fleet batch projections', async () => {
    const user = userEvent.setup()
    const workspaceValue = workspaceWithFleetReferenceChain()
    const activeTransaction = must(createHaulageTransaction({
      id: fixtureTransactionId('REC-ACTIVE'),
      shiftId: fixtureShiftId('SHIFT-SETUP'),
      pile: buildFixtureSapPile('S1_01'),
      batchPosition: createBatchPosition(must(parseBatchNumber(1)), must(parseRitNumber(1))),
      fleetId: fixtureFleetId('FLEET-C'),
      truckId: fixtureTruckId('T2'),
      masterData: workspaceValue.masterData,
      fleetSetup: workspaceValue.fleetSetup,
    }))
    const inactiveTransaction = must(createHaulageTransaction({
      id: fixtureTransactionId('REC-INACTIVE'),
      shiftId: fixtureShiftId('SHIFT-SETUP'),
      pile: buildFixtureSapPile('S1_01'),
      batchPosition: createBatchPosition(must(parseBatchNumber(1)), must(parseRitNumber(2))),
      fleetId: fixtureFleetId('FLEET-A'),
      truckId: fixtureTruckId('T1'),
      masterData: workspaceValue.masterData,
      fleetSetup: workspaceValue.fleetSetup,
    }))
    vi.mocked(localOperationalStore.listProductionRecordsForShift).mockResolvedValueOnce({
      ok: true,
      value: [buildFixtureProductionRecord({ transaction: activeTransaction }), buildFixtureProductionRecord({ transaction: inactiveTransaction })],
    })
    const { container } = renderPage(workspaceValue)

    await user.click(screen.getByRole('button', { name: 'Expand Fleet F3' }))
    await waitFor(() => expect(container.querySelector('[data-recorded-tone="active"]')).toHaveClass('bg-blue-100', 'text-blue-800'))
    expect(container.querySelector('[data-ui="fleet-truck-matrix"] [aria-label="T1"]')).toHaveClass('border-border', 'bg-surface')
    expect(container.querySelector('[data-ui="fleet-pile-id"]')).toHaveClass('qps-primary-data', 'qps-fleet-pile-id', 'whitespace-nowrap', 'fleet-pile-id', 'text-[1.0625rem]')
    expect(container.querySelector('[data-ui="fleet-truck-matrix"]')).toHaveClass('grid-cols-3', 'min-[24rem]:grid-cols-4', 'gap-1')
    expect(container.querySelector('[data-ui="fleet-pile-batch-row"]')).toHaveClass('grid-cols-[4.75rem_3rem_minmax(0,1fr)]', 'gap-x-3')
    expect(container.querySelector('[data-ui="fleet-number-action"] span')).toHaveClass('fleet-list-number')
    await user.click(screen.getByRole('button', { name: 'Expand Fleet F1' }))
    await waitFor(() => expect(container.querySelector('[data-recorded-tone="inactive"]')).toHaveClass('bg-blue-50', 'text-blue-700'))
    expect(container.querySelector('[data-ui="fleet-truck-matrix"] [data-recorded]')).not.toHaveClass('bg-focus-accent-soft')
  })

  it('expands only from the Fleet row and keeps its number as the Edit trigger', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    const detail = container.querySelector('[data-ui="fleet-expand-detail"]')
    expect(detail).toHaveAttribute('hidden')
    await user.click(screen.getByRole('button', { name: 'Expand Fleet F1' }))
    expect(detail).not.toHaveAttribute('hidden')
    expect(container.querySelector('[data-ui="fleet-expanded-identity"]')).toHaveTextContent('F1')
    expect(container.querySelector('[data-ui="fleet-expanded-identity"] p')).toHaveClass('qps-fleet-full-id', 'text-xl', 'font-bold')
    expect(detail).toHaveClass('ml-[3.35rem]', 'pt-1.5')
    expect(container.querySelector('[data-ui="fleet-expand-detail"]')).not.toHaveTextContent('Pile ID')
    expect(container.querySelector('[data-ui="fleet-number-action"]')).toHaveTextContent('01')
    expect(container.querySelector('[data-ui="fleet-number"]')).toHaveClass('qps-fleet-number--odd')
    await user.click(screen.getByRole('button', { name: 'Collapse Fleet F1' }))
    expect(detail).toHaveAttribute('hidden')
    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit Fleet' }))
    expect(screen.getByRole('dialog', { name: 'Edit Fleet F1' })).toBeInTheDocument()
    expect(detail).toHaveAttribute('hidden')
  })

  it('keeps Edit Fleet available from its number when Production records exist', async () => {
    const user = userEvent.setup()
    const workspaceValue = workspace()
    const production = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({
        id: 'TX-FLEET-HISTORY', shiftId: 'SHIFT-SETUP', pile: buildFixtureSapPile('S1_01'), batch: 1, rit: 1,
        masterData: workspaceValue.masterData, fleetSetup: workspaceValue.fleetSetup,
      }),
      disposition: 'REJECT',
    })
    vi.mocked(localOperationalStore.listProductionRecordsForShift).mockResolvedValueOnce({ ok: true, value: [production] })
    renderPage(workspaceValue)

    await user.click(screen.getByRole('button', { name: 'Fleet actions for F1' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit Fleet' }))
    expect(screen.getByRole('dialog', { name: 'Edit Fleet F1' })).toBeInTheDocument()
  })

  it('saves Takdir and Ismail as Sampler without showing a Job Desk field', async () => {
    const user = userEvent.setup()
    const currentWorkspace = workspace()
    renderPage({
      ...currentWorkspace,
      manpower: [
        ...currentWorkspace.manpower,
        { personId: '230268', name: 'Takdir', jobDeskCode: '', isPic: false },
        { personId: '230235', name: 'Ismail', jobDeskCode: 'Sampler', isPic: false },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))
    await user.click(screen.getByRole('button', { name: 'Edit Manpower' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit Manpower' })
    expect(dialog.querySelector('[data-ui="manpower-dialog-list"]')).toHaveClass('overflow-y-auto')
    expect(dialog.querySelector('[data-ui="manpower-dialog-actions"]')).toHaveClass('grid-cols-2')
    expect(dialog.querySelector('[data-ui="manpower-dialog-search"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current Checker')).toBeInTheDocument()
    expect(screen.getByLabelText('Current Checker')).toHaveClass('ClipboardPenLine')
    expect(dialog.querySelector('[data-ui="manpower-dialog-current-checker"]')).toHaveTextContent('Checker')
    expect(screen.getByRole('button', { name: 'Make Takdir Checker' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make Supervisor One Checker' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Job Desk for Takdir')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Job Desk for Ismail')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Manpower' }))

    await waitFor(() =>
      expect(localOperationalStore.updateShiftManpower).toHaveBeenCalledWith(
        fixtureShiftId('SHIFT-SETUP'),
        expect.arrayContaining([
          expect.objectContaining({ personId: '230268', jobDeskCode: 'Sampler', isPic: false }),
          expect.objectContaining({ personId: '230235', jobDeskCode: 'Sampler', isPic: false }),
        ]),
        'P-1',
      ),
    )
  })

  it('allows both Staff and Crew to replace the Checker without overwriting a Staff role', async () => {
    const user = userEvent.setup()
    const currentWorkspace = workspace()
    renderPage({
      ...currentWorkspace,
      manpower: [
        ...currentWorkspace.manpower,
        { personId: '230268', name: 'Takdir', jobDeskCode: 'Sampler', isPic: false },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Expand Manpower' }))
    await user.click(screen.getByRole('button', { name: 'Edit Manpower' }))
    await user.click(screen.getByRole('button', { name: 'Make Supervisor One Checker' }))
    expect(document.querySelector('[data-ui="manpower-dialog-current-checker"]')).toHaveTextContent('Supervisor (Checker)')
    await user.click(screen.getByRole('button', { name: 'Save Manpower' }))
    await waitFor(() =>
      expect(localOperationalStore.updateShiftManpower).toHaveBeenLastCalledWith(
        fixtureShiftId('SHIFT-SETUP'),
        expect.arrayContaining([
          expect.objectContaining({ personId: 'P-2', jobDeskCode: 'Supervisor', isPic: true }),
          expect.objectContaining({ personId: 'P-1', jobDeskCode: 'Sampler', isPic: false }),
        ]),
        'P-2',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Edit Manpower' }))
    await user.click(screen.getByRole('button', { name: 'Make Takdir Checker' }))
    expect(document.querySelector('[data-ui="manpower-dialog-current-checker"]')).toHaveTextContent('Takdir')
    await user.click(screen.getByRole('button', { name: 'Save Manpower' }))
    await waitFor(() =>
      expect(localOperationalStore.updateShiftManpower).toHaveBeenLastCalledWith(
        fixtureShiftId('SHIFT-SETUP'),
        expect.any(Array),
        '230268',
      ),
    )
  })

  it('opens Add Sample in a centered floating modal with config-driven setup fields', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))

    const dialog = screen.getByRole('dialog', { name: 'Add Sample' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('w-[calc(100vw-24px)]', 'max-w-[440px]')
    expect(dialog).not.toHaveClass('bottom-0', 'inset-x-0')
    expect(dialog).toHaveAttribute('data-ui', 'active-sample-dialog')
    expect(dialog.querySelector('[data-ui="sample-dialog-actions"]')).toContainElement(
      screen.getByRole('button', { name: 'Cancel' }),
    )
    expect(dialog.querySelector('[data-ui="sample-dialog-actions"]')).toContainElement(
      screen.getByRole('button', { name: 'Save Sample' }),
    )
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeDisabled()
    const backdrop = document.querySelector('[data-ui="sample-dialog-backdrop"]')
    expect(backdrop).toBeInTheDocument()
    if (backdrop) fireEvent.pointerDown(backdrop)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Add Sample' })).toBeInTheDocument()
    expect(screen.getByLabelText('Sample progress')).toBeInTheDocument()
    expect(screen.getByLabelText('Pile_Id')).toBeInTheDocument()
    expect(screen.getByLabelText('Batch')).toBeInTheDocument()
    expect(screen.getByLabelText('Trip')).toBeInTheDocument()
    expect(screen.getByLabelText('Sample In House')).toHaveValue('')
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE')
    expect(screen.getByText('0 of — Incr')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Pile_Id'), 'S1_01')
    const pileCandidate = screen.getByRole('button', { name: /Select .*S1_01/ })
    expect(pileCandidate).toHaveTextContent('SS_01')
    expect(pileCandidate).toHaveTextContent('S1_01')
    expect(pileCandidate).toHaveTextContent('SAP')
    expect(pileCandidate.querySelector('[data-ui="sample-dialog-material"]')).toHaveAttribute('data-material', 'SAP')

    await user.click(pileCandidate)
    expect(screen.getByText('0 of 10 Incr')).toBeInTheDocument()
    expect(dialog.querySelector('[data-ui="sample-dialog-pile-selected"]')).toHaveAttribute('data-material', 'SAP')
    expect(dialog.querySelector('[data-ui="sample-dialog-progress"]')).toHaveAttribute('data-material', 'SAP')

    await user.selectOptions(screen.getByLabelText('Status'), 'INACTIVE')
    expect(screen.getByRole('option', { name: 'Unplanned' })).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveAttribute('data-status', 'INACTIVE')

    await user.type(screen.getByLabelText('Batch'), '5')
    await user.type(screen.getByLabelText('Trip'), '6')
    await user.type(screen.getByLabelText('Sample In House'), '3')
    expect(screen.getByText('3 Sample In House')).toBeInTheDocument()
    expect(screen.getByText('Max 3 Bags')).toBeInTheDocument()
    expect(dialog.querySelector('[data-testid="sample-progress-in-house"]')).toHaveClass('bg-red-500')
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save Sample' }))
    await waitFor(() =>
      expect(localOperationalStore.updatePileRegistrations).toHaveBeenCalledWith(
        fixtureShiftId('SHIFT-SETUP'),
        expect.arrayContaining([
          expect.objectContaining({
            pileId: fixturePileId('S1_01'),
            batch: 5,
            rit: 6,
            status: 'INACTIVE',
            sampleInHouse: 3,
          }),
        ]),
      ),
    )
  })

  it('keeps Pile options inside the Add Sample form body when neither direction fits the full list', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))

    const dialog = screen.getByRole('dialog', { name: 'Add Sample' })
    const dialogBody = dialog.querySelector('[data-ui="sample-dialog-body"]') as HTMLDivElement
    const pileField = dialog.querySelector('[data-ui="sample-dialog-pile"]') as HTMLDivElement
    vi.spyOn(dialogBody, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      bottom: 380,
      height: 180,
    } as DOMRect)
    vi.spyOn(pileField, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      bottom: 348,
      height: 48,
    } as DOMRect)

    await user.type(screen.getByLabelText('Pile_Id'), 'S1')

    await waitFor(() =>
      expect(dialog.querySelector('[data-ui="sample-dialog-pile-options"]')).toBeInTheDocument(),
    )
    const options = dialog.querySelector('[data-ui="sample-dialog-pile-options"]') as HTMLDivElement
    expect(options).toHaveAttribute('data-placement', 'below')
    expect(options).toHaveClass('top-full', 'mt-1')
    expect(options).toHaveStyle({ maxHeight: '28px' })
  })

  it('keeps Sample selected through Delete, Undo, Add Sample, and Save', async () => {
    const user = userEvent.setup()
    // The production shell unmounts its route child while refreshWorkspace
    // reads IndexedDB. Model that lifecycle rather than only asserting local
    // state in one mounted RegistrationPage instance.
    renderPage(workspace(), true)
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    const action = await screen.findByRole('button', { name: 'Sample actions for S1_01 batch 1' })
    await user.click(action)
    const edit = screen.getByRole('menuitem', { name: 'Edit' })
    const remove = screen.getByRole('menuitem', { name: 'Delete' })
    expect(edit).toHaveClass('flex', 'min-h-11')
    expect(edit.querySelector('svg')).toHaveClass('lucide-pencil')
    expect(remove).toHaveClass('flex', 'min-h-11', 'text-foreground')
    expect(remove).not.toHaveClass('text-danger')
    expect(remove.querySelector('svg')).toHaveClass('lucide-x', 'text-danger')
    await user.click(edit)
    expect(screen.getByRole('dialog', { name: 'Edit Sample' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Sample' }))
    await user.click(await screen.findByRole('button', { name: 'Sample actions for S1_01 batch 1' }))
    const reopenedDelete = screen.getByRole('menuitem', { name: 'Delete' })
    await user.click(reopenedDelete)
    await user.click(await screen.findByRole('button', { name: 'Undo' }))

    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    await user.type(screen.getByLabelText('Pile_Id'), 'S1_01')
    await user.click(screen.getByRole('button', { name: /Select .*S1_01/ }))
    await user.type(screen.getByLabelText('Batch'), '5')
    await user.type(screen.getByLabelText('Trip'), '5')
    await user.type(screen.getByLabelText('Sample In House'), '1')
    await user.click(screen.getByRole('button', { name: 'Save Sample' }))

    await waitFor(() => expect(localOperationalStore.updatePileRegistrations).toHaveBeenCalled())
    expect(screen.getByRole('tab', { name: 'Sample' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Add Sample' })).not.toBeInTheDocument()
  })

  it('rejects a Trip above the selected pile configuration and impossible physical bags', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Sample' }))
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    await user.type(screen.getByLabelText('Pile_Id'), 'S1_01')
    await user.click(screen.getByRole('button', { name: /Select .*S1_01/ }))
    await user.type(screen.getByLabelText('Batch'), '5')
    await user.type(screen.getByLabelText('Trip'), '21')

    expect(screen.getByText('Trip cannot exceed 20 for SAP.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeDisabled()

    await user.clear(screen.getByLabelText('Trip'))
    await user.type(screen.getByLabelText('Trip'), '15')
    await user.type(screen.getByLabelText('Sample In House'), '15')
    expect(screen.getByText('Maximum possible In House is 7 bags.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeDisabled()

    await user.clear(screen.getByLabelText('Sample In House'))
    await user.type(screen.getByLabelText('Sample In House'), '7')
    expect(screen.getByText('Max 7 Bags')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeEnabled()
  })

  it('uses the Setup Trip for Sample progress even when Production has advanced further', async () => {
    const user = userEvent.setup()
    vi.clearAllMocks()
    const workspaceValue = workspace()
    const pile = buildFixtureSapPile('S1_01')
    const productionAtTripEighteen = buildFixtureProductionRecord({
      transaction: buildFixtureHaulageTransaction({
        id: 'TX-8',
        shiftId: 'SHIFT-SETUP',
        pile,
        batch: 1,
        rit: 18,
        masterData: workspaceValue.masterData,
        fleetSetup: workspaceValue.fleetSetup,
      }),
    })
    vi.mocked(localOperationalStore.listProductionRecordsForShift).mockResolvedValue({
      ok: true,
      value: [productionAtTripEighteen],
    })

    const { container } = renderPage({
      ...workspaceValue,
      pileRegistrations: [{
        pileId: fixturePileId('S1_01'),
        oreCode: must(parseOreCode('SAP')),
        batch: must(parseBatchNumber(1)),
        rit: must(parseRitNumber(12)),
        status: 'ACTIVE',
        sampleInHouse: 6,
      }],
    })
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    expect(container.querySelector('[data-ui="sample-batch-trip"]')).toHaveTextContent('01/012')
    expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveTextContent('06/06')
    expect(container.querySelector('[data-ui="sample-status"]')).toHaveTextContent('Not Picked Up')
    expect(screen.getByText('6 In House')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="sample-toolbar-summary-secondary"]')).toHaveClass('text-danger')
    expect(container.querySelector('[data-ui="sample-toolbar-summary-secondary"]')).not.toHaveClass('text-warning')
    await waitFor(() =>
      expect(localOperationalStore.listProductionRecordsForShift).toHaveBeenCalledWith(fixtureShiftId('SHIFT-SETUP')),
    )
  })

  it('uses recorded delivery progress and sums explicit In House bags once per Pile and Batch', async () => {
    const user = userEvent.setup()
    vi.clearAllMocks()
    const deliveredAtTripTwo = {
      pileId: fixturePileId('S1_01'),
      batchNumber: must(parseBatchNumber(1)),
      sampledRitNumbers: [must(parseRitNumber(2))],
      delivery: { status: 'DELIVERED' },
    } as unknown as SamplePosition
    vi.mocked(localOperationalStore.listSamplePositionsForShift).mockResolvedValue({
      ok: true,
      value: [deliveredAtTripTwo],
    })
    const workspaceValue = workspace()
    const { container } = renderPage({
      ...workspaceValue,
      pileRegistrations: [
        {
          pileId: fixturePileId('S1_01'),
          oreCode: must(parseOreCode('SAP')),
          batch: must(parseBatchNumber(1)),
          rit: must(parseRitNumber(5)),
          status: 'ACTIVE',
        },
        {
          pileId: fixturePileId('S1_01'),
          oreCode: must(parseOreCode('SAP')),
          batch: must(parseBatchNumber(2)),
          rit: must(parseRitNumber(5)),
          status: 'ACTIVE',
          sampleInHouse: 2,
        },
      ],
    })
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    await waitFor(() => expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveTextContent('01/02'))
    expect(screen.getAllByText('Not Picked Up').length).toBeGreaterThan(0)
    expect(screen.getByText('3 In House')).toBeInTheDocument()
  })

  it('shows Dispatched only after every eligible SAP bag for the Setup Trip is delivered', async () => {
    const user = userEvent.setup()
    vi.clearAllMocks()
    const deliveredPositions = [2, 4].map((rit) => ({
      pileId: fixturePileId('S1_01'),
      batchNumber: must(parseBatchNumber(1)),
      sampledRitNumbers: [must(parseRitNumber(rit))],
      delivery: { status: 'DELIVERED' },
    }) as unknown as SamplePosition)
    vi.mocked(localOperationalStore.listSamplePositionsForShift).mockResolvedValue({
      ok: true,
      value: deliveredPositions,
    })
    const workspaceValue = workspace()
    const { container } = renderPage({
      ...workspaceValue,
      pileRegistrations: [{
        pileId: fixturePileId('S1_01'),
        oreCode: must(parseOreCode('SAP')),
        batch: must(parseBatchNumber(1)),
        rit: must(parseRitNumber(5)),
        status: 'ACTIVE',
      }],
    })
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    await waitFor(() => expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveTextContent('02/02'))
    expect(container.querySelector('[data-ui="sample-status"]')).toHaveTextContent('Dispatched')
  })

  it('treats zero explicit Samples In House as all eligible SAP samples dispatched', async () => {
    const user = userEvent.setup()
    vi.clearAllMocks()
    vi.mocked(localOperationalStore.listSamplePositionsForShift).mockResolvedValue({ ok: true, value: [] })
    const workspaceValue = workspace()
    const { container } = renderPage({
      ...workspaceValue,
      pileRegistrations: [{
        pileId: fixturePileId('S5_43'),
        oreCode: must(parseOreCode('SAP')),
        batch: must(parseBatchNumber(56)),
        rit: must(parseRitNumber(19)),
        status: 'ACTIVE',
        sampleInHouse: 0,
      }],
    })
    await user.click(screen.getByRole('tab', { name: 'Sample' }))

    await waitFor(() => expect(container.querySelector('[data-ui="sample-row-sample"]')).toHaveTextContent('09/09'))
    expect(container.querySelector('[data-ui="sample-status"]')).toHaveTextContent('Dispatched')
  })
})
