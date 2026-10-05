import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode } from '@/domain/common/codes'
import { createMasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference } from '@/domain/master/references'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureShift,
  fixturePileId,
  fixtureShiftId,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { RegistrationPage } from './RegistrationPage'

vi.mock('@/app/local-operational-store', () => ({
  localOperationalStore: {
    getShiftSummarySyncRecord: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    listHaulageTransactionsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listProductionRecordsForShift: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listProductionRecordsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listSamplePositionsForShift: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listSamplePositionsForShiftPile: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

function renderPage() {
  const context: ActiveWorkspaceContext = { workspace: workspace(), refreshWorkspace: vi.fn() }
  return render(
    <MemoryRouter initialEntries={['/regist']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/regist" element={<RegistrationPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RegistrationPage active-shift Setup', () => {
  it('shows the three panels, read-only status, and no inline active-shift add controls', () => {
    const { container } = renderPage()
    expect(screen.getByText('Manpower')).toBeInTheDocument()
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByText('Fleet')).toBeInTheDocument()
    expect(screen.getByText(/Online/)).toBeInTheDocument()
    expect(screen.getByText('Work location')).toBeInTheDocument()
    expect(screen.getByText('S1 · HOUSE-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Manpower' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Sample' })).not.toBeInTheDocument()
    expect(screen.getByTestId('manpower-crew-strip-P-1')).toHaveClass('bg-blue-500/70')
    expect(screen.getByTestId('manpower-crew-strip-P-2')).not.toHaveClass('bg-blue-500/70')
    expect(screen.getByTestId('manpower-row-P-1')).toHaveClass('grid-cols-[3px_18px_minmax(0,1fr)]')
    expect(screen.getByLabelText('Checker')).toBeInTheDocument()

    const sampleRow = screen.getByText('S1_01').parentElement
    expect(sampleRow).toHaveClass('grid-cols-[3px_minmax(0,1fr)_64px_88px_28px]')
    expect(sampleRow).toHaveTextContent('01/011')

    const setupIcons = Array.from(container.querySelectorAll('svg[data-icon$="-safety"]'))
    expect(setupIcons.map((icon) => icon.getAttribute('data-icon'))).toEqual([
      'manpower-safety',
      'sample-safety',
      'fleet-safety',
    ])
    for (const icon of setupIcons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('width', '26')
      expect(icon).toHaveAttribute('height', '26')
      expect(icon).toHaveAttribute('stroke-width', '1.8')
      expect(icon).toHaveClass('text-primary')
    }

    const panels = Array.from(container.querySelectorAll('section'))
    expect(panels).toHaveLength(3)
    expect(panels[0]).toHaveClass('flex-[1_1_0%]')
    expect(panels[1]).toHaveClass('flex-[2_1_0%]')
    expect(panels[2]).toHaveClass('flex-[2_1_0%]')
  })

  it('keeps all three bordered sections visible while expanding a summary', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 })
    renderPage()
    await user.click(screen.getByRole('button', { name: /Show More/ }))
    expect(screen.getByText(/F1/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show Less/ }))
    expect(screen.getByText(/F1/)).toBeInTheDocument()
  })

  it('opens the dimmed floating menu in the specified order', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add setup item' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Manpower',
      'Sample',
      'Fleet',
    ])
  })

  it('opens Add Sample in a centered floating modal with config-driven setup fields', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add setup item' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sample' }))

    const dialog = screen.getByRole('dialog', { name: 'Add Sample' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('w-[calc(100vw-24px)]', 'max-w-[440px]')
    expect(dialog).not.toHaveClass('bottom-0', 'inset-x-0')
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample' })).toBeDisabled()
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
    expect(pileCandidate.querySelector('.text-emerald-700')).toHaveTextContent('SAP')

    await user.click(pileCandidate)
    expect(screen.getByText('0 of 10 Incr')).toBeInTheDocument()
    expect(screen.getByText('SAP')).toHaveClass('text-emerald-700')

    await user.selectOptions(screen.getByLabelText('Status'), 'INACTIVE')
    expect(screen.getByRole('option', { name: 'Unplanned' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Batch'), '5')
    await user.type(screen.getByLabelText('Trip'), '6')
    await user.type(screen.getByLabelText('Sample In House'), '3')
    expect(screen.getByText('3 Sample In House')).toBeInTheDocument()
    expect(screen.getByText('Max 3 Bags')).toBeInTheDocument()
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

  it('rejects a Trip above the selected pile configuration and impossible physical bags', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Add setup item' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sample' }))
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
})
