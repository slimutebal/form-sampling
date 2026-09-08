import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { HomePage } from './HomePage'

function buildWorkspace(): LocalShiftWorkspace {
  const masterData = buildFixtureMasterData()
  const fleetSetup = buildFixtureFleetSetup(masterData)
  const shift = buildFixtureShift('shift-1')
  const pile = buildFixtureSapPile('PILE-1')
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

function TestActiveShell({ workspace }: { workspace: LocalShiftWorkspace }) {
  return <Outlet context={{ workspace, refreshWorkspace: () => {} } satisfies ActiveWorkspaceContext} />
}

function renderHome(workspace: LocalShiftWorkspace) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<TestActiveShell workspace={workspace} />}>
            <Route path="/home" element={<HomePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('A. is not a placeholder — shows real shift/sector/sampling house and Piles/Home headings', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    const workspace = buildWorkspace()
    renderHome(workspace)

    expect(screen.queryByText('This screen is a navigation placeholder for Phase 1. No operational features yet.')).not.toBeInTheDocument()
    expect(await screen.findByText('S1 · HOUSE-1')).toBeInTheDocument()
  })

  it('B. shows real activity counts derived from stored haulage/sample data', async () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('shift-1')
    const pile = buildFixtureSapPile('PILE-1')
    const wrongTruckTransaction = buildFixtureHaulageTransaction({
      id: 'txn-1',
      shiftId: 'shift-1',
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({
      ok: true,
      value: [wrongTruckTransaction],
    })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    renderHome({
      shiftId: shift.id,
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
      pendingBatches: [],
      pendingSamples: [],
      manpower: [],
    })

    expect(await screen.findByText('1')).toBeInTheDocument()
    const wrongTruckTile = (await screen.findByText('Wrong Truck')).closest('div')
    expect(wrongTruckTile).toHaveTextContent('1')
  })

  it('C. shows Manpower and PIC counts (multiple PICs counted correctly) and the three quick actions', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    const workspace = {
      ...buildWorkspace(),
      manpower: [
        createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Checker', true),
        createManpowerAssignment('SCM0627', 'Wahyudin Madilao', 'Checker', true),
        createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
      ],
    }
    renderHome(workspace)

    const manpowerTile = (await screen.findByText('Manpower')).closest('div')
    expect(manpowerTile).toHaveTextContent('3')
    const picTile = (await screen.findByText('PIC')).closest('div')
    expect(picTile).toHaveTextContent('2')

    expect(screen.getByRole('link', { name: 'Input DT / Open Pile' })).toHaveAttribute('href', '/production?tab=record')
    expect(screen.getByRole('link', { name: 'Sample Handling' })).toHaveAttribute('href', '/samples')
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute('href', '/report')
  })

  it('D. shows a compact Manpower summary with an Edit action linking to the mid-shift edit screen', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    const workspace = {
      ...buildWorkspace(),
      manpower: [
        createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Checker', true),
        createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
      ],
    }
    renderHome(workspace)

    expect(await screen.findByText('1 Staff · 1 Crew')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ubah Manpower' })).toHaveAttribute('href', '/manpower/edit')
  })
})
