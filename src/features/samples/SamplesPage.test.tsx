import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import { buildFixtureFleetSetup, buildFixtureMasterData, buildFixtureSapPile, buildFixtureShift } from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { SamplesPage } from './SamplesPage'

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

function renderSamples(workspace: LocalShiftWorkspace) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/samples']}>
        <Routes>
          <Route element={<TestActiveShell workspace={workspace} />}>
            <Route path="/samples" element={<SamplesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('SamplesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is not a placeholder — renders the real Sample Handling screen wired to the current workspace', async () => {
    renderSamples(buildWorkspace())

    expect(await screen.findByRole('heading', { name: 'Samples' })).toBeInTheDocument()
    expect(screen.queryByText('This screen is a navigation placeholder for Phase 1. No operational features yet.')).not.toBeInTheDocument()
    expect(screen.getByText('Pending Samples')).toBeInTheDocument()
  })
})
