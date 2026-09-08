import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { ProductionRecord } from '@/domain/production/production-record'
import i18n from '@/i18n'
import { ProductionBatchDetailPage } from './ProductionBatchDetailPage'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const shift = buildFixtureShift('SHIFT-1')
const pile = buildFixtureSapPile('S5_02')

function buildWorkspace(): LocalShiftWorkspace {
  return {
    shiftId: shift.id,
    shift,
    piles: [pile],
    masterData,
    fleetSetup,
    pendingBatches: [],
    pendingSamples: [],
    manpower: [],
  }
}

function ActiveShell({ workspace }: { workspace: LocalShiftWorkspace }) {
  return <Outlet context={{ workspace, refreshWorkspace: () => {} } satisfies ActiveWorkspaceContext} />
}

function renderPage(batchNumber = 4) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/production/detail/S5_02/batch/${batchNumber}`]}>
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route path="/production/detail/:pileId/batch/:batchNumber" element={<ProductionBatchDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function record(id: string, rit: number, disposition: 'ACCEPT' | 'REJECT', batch = 4, truckId?: string) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
    truckId,
  })
  return buildFixtureProductionRecord({ transaction, disposition, contamination: 'OVR' })
}

function mockRecords(records: readonly ProductionRecord[]) {
  vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProductionBatchDetailPage', () => {
  it('uses the full "{Pile_ID} Batch {N}" header text, never abbreviated', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT')])
    renderPage(4)
    expect(await screen.findByRole('heading', { name: 'S5_02 Batch 4' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /B4/ })).not.toBeInTheDocument()
  })

  it('renders Status/Material/Capacity/Progress/Reject/Sample/Wrong Truck', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT'), record('TX-3', 3, 'REJECT')])
    renderPage(4)

    expect(await screen.findByText('Status')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('Material')).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()
    expect(screen.getByText('Capacity')).toBeInTheDocument()
    expect(screen.getByText('20 Rit')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByText('2 Accepted / 20')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByText('Wrong Truck')).toBeInTheDocument()
  })

  it('shows the Missed Rit warning line only when the Batch has a missed Rit', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'REJECT'), record('TX-3', 3, 'ACCEPT')])
    renderPage(4)
    expect(await screen.findByText('⚠ Missed Rit: 2')).toBeInTheDocument()
  })

  it('lists Ritase rows in ascending Rit order, with Truck/Disposition/Contamination and a SAMPLE tag', async () => {
    mockRecords([
      record('TX-1', 1, 'ACCEPT', 4, FIXTURE_IN_FLEET_TRUCK_ID), // Rit 1: not a sample point
      record('TX-2', 2, 'ACCEPT', 4, FIXTURE_IN_FLEET_TRUCK_ID), // Rit 2: SAP interval 2 -> sample point
    ])
    renderPage(4)

    const rows = await screen.findAllByText(/^0[12]$/)
    expect(rows.map((row) => row.textContent)).toEqual(['01', '02'])

    const rit2Row = rows[1]!.closest('a')!
    expect(rit2Row).toHaveTextContent(FIXTURE_IN_FLEET_TRUCK_ID)
    expect(rit2Row).toHaveTextContent('ACCEPT')
    expect(rit2Row).toHaveTextContent('OVR')
    expect(rit2Row).toHaveTextContent('SAMPLE')
    expect(rit2Row).toHaveAttribute('href', '/production/detail/S5_02/batch/4/rit/2')
  })

  it('renders a MISSED row (no accepted record, no duplicate slot) for a gap Rit', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'REJECT'), record('TX-3', 3, 'ACCEPT')])
    renderPage(4)

    const rows = await screen.findAllByText(/^0[123]$/)
    expect(rows).toHaveLength(3)
    const missedRow = rows[1]!.closest('a')!
    expect(missedRow).toHaveTextContent('MISSED')
    expect(missedRow).toHaveAttribute('href', '/production/detail/S5_02/batch/4/rit/2')
  })
})
