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
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { ProductionPage } from './ProductionPage'

function buildWorkspace(): LocalShiftWorkspace {
  const masterData = buildFixtureMasterData()
  const fleetSetup = buildFixtureFleetSetup(masterData)
  const shift = buildFixtureShift('production-ui-shift')
  const pile = buildFixtureSapPile('S5_02')
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

function renderProduction(initialEntry = '/production') {
  const workspace = buildWorkspace()
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<ActiveShell workspace={workspace} />}>
            <Route path="/production" element={<ProductionPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('ProductionPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('id')
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to Record and lists active workspace Pile_ID values with their material', async () => {
    renderProduction()

    expect(await screen.findByText('Pilih Pile_ID (Active)')).toBeInTheDocument()
    expect(screen.getByText('S5_02')).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /S5_02/i })).toHaveAttribute('href', '/production/record/S5_02')
  })

  it('places the Pile search immediately before the Detail/Record controls and filters the list', async () => {
    const user = userEvent.setup()
    renderProduction()

    const search = await screen.findByPlaceholderText('Cari Pile_ID…')
    const detailButton = screen.getByRole('button', { name: 'Detail' })
    const recordButton = screen.getByRole('button', { name: 'Record' })

    expect(search.compareDocumentPosition(detailButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(detailButton.compareDocumentPosition(recordButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.type(search, 'tidak-ada')
    expect(screen.queryByText('S5_02')).not.toBeInTheDocument()
  })

  it('switches to Detail in place and changes Pile links to the detail route', async () => {
    const user = userEvent.setup()
    renderProduction()

    await user.click(await screen.findByRole('button', { name: 'Detail' }))

    expect(await screen.findByText('Pilih Pile_ID')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /S5_02/i })).toHaveAttribute('href', '/production/detail/S5_02')
  })
})
