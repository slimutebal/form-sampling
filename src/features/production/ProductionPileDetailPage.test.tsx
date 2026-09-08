import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { ProductionRecord } from '@/domain/production/production-record'
import i18n from '@/i18n'
import { ProductionPileDetailPage } from './ProductionPileDetailPage'

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

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/production/detail/S5_02']}>
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route path="/production/detail/:pileId" element={<ProductionPileDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function record(id: string, rit: number, disposition: 'ACCEPT' | 'REJECT', batch = 1) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition })
}

function mockRecords(records: readonly ProductionRecord[]) {
  vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
  vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProductionPileDetailPage', () => {
  it('renders the header as "DETAIL <Pile_ID>" with Ore, no warning panel for a normal Pile', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT')])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'DETAIL S5_02' })).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()
    expect(screen.queryByText(/PRODUCTION WARNING/)).not.toBeInTheDocument()
  })

  it('renders the RINGKASAN/summary cards from the pile summary projection', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT'), record('TX-2', 2, 'ACCEPT'), record('TX-3', 3, 'REJECT')])
    renderPage()

    expect(await screen.findByText('PRODUCTION SUMMARY')).toBeInTheDocument()
    const batchTotalTile = (await screen.findByText('Batch Total')).closest('div')
    expect(batchTotalTile).toHaveTextContent('1')
    const acceptTile = screen.getByText('Accepted Rit').closest('div')
    expect(acceptTile).toHaveTextContent('2')
    const rejectTile = screen.getByText('Rejected Rit').closest('div')
    expect(rejectTile).toHaveTextContent('1')
  })

  it('shows the PRODUCTION WARNING panel with every missed Batch/Rit when a Rit is missed', async () => {
    mockRecords([
      record('TX-1', 1, 'ACCEPT', 4),
      record('TX-2', 2, 'REJECT', 4),
      record('TX-3', 3, 'ACCEPT', 4), // Batch 4: Rit 2 missed
    ])
    renderPage()

    expect(await screen.findByText('⚠ PRODUCTION WARNING')).toBeInTheDocument()
    expect(screen.getByText('Batch 4 • Missed Rit: 2')).toBeInTheDocument()
  })

  it('renders one Batch card per Batch, with status and a Missed Rit line only when applicable', async () => {
    mockRecords([
      record('TX-1', 1, 'ACCEPT', 4),
      record('TX-2', 2, 'REJECT', 4),
      record('TX-3', 3, 'ACCEPT', 4), // Batch 4: ACTIVE, missed Rit 2
      record('TX-4', 1, 'ACCEPT', 2), // Batch 2: ACTIVE, no missed Rit
    ])
    renderPage()

    const batch4Link = (await screen.findByText('Batch 4')).closest('a')!
    expect(batch4Link).toHaveTextContent('ACTIVE')
    expect(batch4Link).toHaveTextContent('⚠ Missed Rit: 2')
    expect(batch4Link).toHaveAttribute('href', '/production/detail/S5_02/batch/4')

    const batch2Link = screen.getByText('Batch 2').closest('a')!
    expect(batch2Link).not.toHaveTextContent('Missed Rit')
  })

  it('"Lihat" scrolls to the first missed Batch, in ascending numeric order', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const user = userEvent.setup()

    mockRecords([
      record('TX-1', 1, 'ACCEPT', 7),
      record('TX-2', 3, 'ACCEPT', 7), // Batch 7: missed Rit 2
      record('TX-3', 1, 'ACCEPT', 4),
      record('TX-4', 3, 'ACCEPT', 4), // Batch 4: missed Rit 2
    ])
    renderPage()

    await screen.findByText('⚠ PRODUCTION WARNING')
    await user.click(screen.getByRole('button', { name: 'View' }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    const batch4Anchor = document.getElementById('batch-4')
    expect(scrollIntoView.mock.instances[0]).toBe(batch4Anchor)
  })
})
