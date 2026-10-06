import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { ProductionPage } from './ProductionPage'

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function buildWorkspace(pileNames = ['S5_02']): LocalShiftWorkspace {
  const masterData = buildFixtureMasterData()
  const fleetSetup = buildFixtureFleetSetup(masterData)
  const shift = buildFixtureShift('production-workspace-shift')
  const piles = pileNames.map(buildFixtureSapPile)
  return {
    shiftId: shift.id,
    shift,
    piles,
    masterData,
    fleetSetup,
    pendingBatches: [],
    pendingSamples: [],
    manpower: [],
    pileRegistrations: piles.map((pile, index) => ({
      pileId: pile.id,
      oreCode: pile.oreCode,
      batch: value(parseBatchNumber(index + 6)),
      rit: value(parseRitNumber(index + 1)),
      status: 'ACTIVE' as const,
    })),
  }
}

function ActiveShell({ workspace }: { workspace: LocalShiftWorkspace }) {
  return <Outlet context={{ workspace, refreshWorkspace: () => {} } satisfies ActiveWorkspaceContext} />
}

function renderProduction(workspace = buildWorkspace()) {
  return render(<MemoryRouter initialEntries={['/production']}><Routes><Route element={<ActiveShell workspace={workspace} />}><Route path="/production" element={<ProductionPage />} /></Route></Routes></MemoryRouter>)
}

describe('ProductionPage Record workspace', () => {
  beforeEach(() => {
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses only Production and Sample Handling modes, with Production selected by default', async () => {
    renderProduction()
    expect(await screen.findByRole('button', { name: 'PRODUCTION' })).toHaveClass('bg-emerald-600')
    expect(screen.getByRole('button', { name: 'SAMPLE HANDLING' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Detail' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument()
  })

  it('places the selected Pile and consistent operational counters in the dashboard', async () => {
    const workspace = buildWorkspace()
    const pile = workspace.piles[0]!
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: workspace.shift.id as string, pile, batch: 6, rit: 2, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: workspace.shift.id as string, pile, batch: 6, rit: 3, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-4', shiftId: workspace.shift.id as string, pile, batch: 6, rit: 4, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup, truckId: 'T2' }), disposition: 'REJECT' }),
    ]
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
    renderProduction(workspace)

    await screen.findByText('2 Trip . 1 Incr')
    const dashboard = screen.getByLabelText('Production dashboard')
    expect(dashboard).toHaveTextContent('S5_02')
    expect(screen.getByLabelText('Production summary')).toHaveTextContent('Total Trip2')
    expect(screen.getByLabelText('Production summary')).toHaveTextContent('Total Incr1')
    expect(screen.getByLabelText('Production summary')).toHaveTextContent('Total Reject1')
    expect(screen.getByLabelText('Active Pile pager')).toHaveTextContent('2 Trip . 1 Incr')
    expect(screen.getByLabelText('Production history controls')).toBeInTheDocument()
    expect(screen.queryByLabelText('Selected Pile')).not.toBeInTheDocument()
  })

  it('keeps production details collapsed until one row is opened, and closes the previous row', async () => {
    const workspace = buildWorkspace()
    const pile = workspace.piles[0]!
    const first = buildFixtureHaulageTransaction({ id: 'TX-17', shiftId: workspace.shift.id as string, pile, batch: 6, rit: 17, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup })
    const second = buildFixtureHaulageTransaction({ id: 'TX-18', shiftId: workspace.shift.id as string, pile, batch: 6, rit: 18, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [buildFixtureProductionRecord({ transaction: first }), buildFixtureProductionRecord({ transaction: second })] })
    const user = userEvent.setup()
    renderProduction(workspace)

    expect(await screen.findByText('01')).toBeInTheDocument()
    expect(screen.getAllByText('06')).not.toHaveLength(0)
    expect(screen.queryByText('Condition')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /01.*F1.*T1.*06.*017/i }))
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Fleet')).toBeInTheDocument()
    expect(screen.getByText('Condition')).toBeInTheDocument()
    expect(screen.getByText('Contam.')).toBeInTheDocument()
    expect(screen.queryByText('Disposition')).not.toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Switch' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Void' })).toHaveClass('text-red-700')

    await user.click(screen.getByRole('button', { name: /02.*F1.*T1.*06.*018/i }))
    expect(screen.getAllByText('Condition')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /02.*F1.*T1.*06.*018/i }))
    expect(screen.queryByText('Condition')).not.toBeInTheDocument()
  })

  it('defaults to Rec descending and directly toggles Rec and numeric Batch sorting', async () => {
    const workspace = buildWorkspace()
    const pile = workspace.piles[0]!
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: workspace.shift.id as string, pile, batch: 5, rit: 7, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }), createdAt: new Date('2026-09-04T10:00:00Z') }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: workspace.shift.id as string, pile, batch: 7, rit: 8, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }), createdAt: new Date('2026-09-04T12:00:00Z') }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-3', shiftId: workspace.shift.id as string, pile, batch: 5, rit: 8, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }), createdAt: new Date('2026-09-04T11:00:00Z') }),
    ]
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
    const user = userEvent.setup()
    renderProduction(workspace)

    await screen.findAllByText('07')
    expect(screen.getByRole('button', { name: 'Rec ▼' })).toHaveAttribute('aria-pressed', 'true')
    const historyRows = () => screen.getAllByRole('button', { name: /F1.*T1.*(05|07).*\// })
    expect(historyRows()[0]).toHaveTextContent('07/008')
    await user.click(screen.getByRole('button', { name: 'Rec ▼' }))
    expect(screen.getByRole('button', { name: 'Rec ▲' })).toHaveAttribute('aria-pressed', 'true')
    expect(historyRows()[0]).toHaveTextContent('05/007')
    await user.click(screen.getByRole('button', { name: 'Batch ▼' }))
    expect(screen.getByRole('button', { name: 'Batch ▼' })).toHaveAttribute('aria-pressed', 'true')
    expect(historyRows()[0]).toHaveTextContent('07/008')
    await user.click(screen.getByRole('button', { name: 'Batch ▼' }))
    expect(historyRows()[0]).toHaveTextContent('05/007')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows exactly four active Pile cards per page and changes selected Pile in place', async () => {
    const workspace = buildWorkspace(['S5_01', 'S5_02', 'S5_03', 'S5_04', 'S5_05'])
    const user = userEvent.setup()
    renderProduction(workspace)
    await screen.findByRole('button', { name: /^S5_01/ })
    const pager = screen.getByLabelText('Active Pile pager')
    expect(within(pager).getAllByRole('button', { name: /S5_0[1234]/ })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'S5_05' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next Pile page' }))
    await user.click(screen.getByRole('button', { name: /S5_05/ }))
    expect(screen.getByLabelText('Production dashboard')).toHaveTextContent('S5_05')
    expect(screen.queryByLabelText('Selected Pile')).not.toBeInTheDocument()
  })

  it('deduplicates active multi-batch registrations and moves Batch choice into Add', async () => {
    const workspace = buildWorkspace()
    const multiBatchWorkspace: LocalShiftWorkspace = {
      ...workspace,
      pileRegistrations: [
        ...workspace.pileRegistrations,
        { ...workspace.pileRegistrations[0]!, batch: value(parseBatchNumber(9)), rit: value(parseRitNumber(10)) },
      ],
    }
    renderProduction(multiBatchWorkspace)
    await screen.findByLabelText('Active Pile pager')
    expect(screen.queryByLabelText('Batch choice')).not.toBeInTheDocument()
    window.dispatchEvent(new CustomEvent('record-workspace:add'))
    expect(await screen.findByRole('dialog', { name: 'Add Production' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Batch 06/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Batch 09/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Active Pile pager').querySelectorAll('button')).toHaveLength(1)
  })

  it('filters accepted history by Batch above the table and removes bottom Pile search', async () => {
    const workspace = buildWorkspace()
    const pile = workspace.piles[0]!
    const records = [
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-1', shiftId: workspace.shift.id as string, pile, batch: 5, rit: 7, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }) }),
      buildFixtureProductionRecord({ transaction: buildFixtureHaulageTransaction({ id: 'TX-2', shiftId: workspace.shift.id as string, pile, batch: 7, rit: 8, masterData: workspace.masterData, fleetSetup: workspace.fleetSetup }) }),
    ]
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
    const user = userEvent.setup()
    renderProduction(workspace)
    const search = await screen.findByLabelText('Search Batch')
    await user.type(search, '05')
    expect(screen.getByRole('button', { name: /01.*05.*007/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /02.*07.*008/ })).not.toBeInTheDocument()
    await user.clear(search)
    expect(screen.getByRole('button', { name: /02.*07.*008/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search Pile_ID')).not.toBeInTheDocument()
  })
})
