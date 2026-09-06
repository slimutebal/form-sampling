import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import {
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_EMPLOYEE_NAME,
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { ReportPage } from './ReportPage'

function buildWorkspace(overrides: Partial<LocalShiftWorkspace> = {}): LocalShiftWorkspace {
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
    ...overrides,
  }
}

function TestActiveShell({ workspace }: { workspace: LocalShiftWorkspace }) {
  return <Outlet context={{ workspace, refreshWorkspace: () => {} } satisfies ActiveWorkspaceContext} />
}

function renderReport(workspace: LocalShiftWorkspace) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/report']}>
        <Routes>
          <Route element={<TestActiveShell workspace={workspace} />}>
            <Route path="/report" element={<ReportPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('ReportPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is not a placeholder — builds the real shift report and shows the WhatsApp preview plus Excel export action', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    renderReport(buildWorkspace())

    expect(await screen.findByRole('heading', { name: 'WhatsApp Report' })).toBeInTheDocument()
    expect(screen.queryByText('This screen is a navigation placeholder for Phase 1. No operational features yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeInTheDocument()
  })

  it('shows only ONE operational report preview — no duplicate plain "Laporan" section above the WhatsApp report (Phase 18 §9)', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    renderReport(buildWorkspace())

    await screen.findByRole('heading', { name: 'WhatsApp Report' })
    // Exactly one page heading and one report-language toggle survive —
    // the previously duplicated structured "ReportSections" view (its own
    // heading and its own separate language toggle) is gone, not merely
    // hidden underneath.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Indonesian' })).toHaveLength(1)
    expect(screen.getByTestId('whatsapp-report-preview')).toBeInTheDocument()
  })

  it('keeps the report action buttons (Copy/Share/Export) available on the single preview', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    renderReport(buildWorkspace())

    await screen.findByRole('heading', { name: 'WhatsApp Report' })
    expect(screen.getByRole('button', { name: 'Copy Report' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeInTheDocument()
  })

  it('wires workspace.manpower (Phase 18 §4) into the built report — never a hardcoded empty list', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({ ok: true, value: [] })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    const workspace = buildWorkspace({
      manpower: [createManpowerAssignment(FIXTURE_EMPLOYEE_ID, FIXTURE_EMPLOYEE_NAME, 'Checker', true)],
    })
    renderReport(workspace)

    const preview = await screen.findByTestId('whatsapp-report-preview')
    expect(preview).toHaveTextContent(FIXTURE_EMPLOYEE_NAME)
  })

  it('shows a translated, non-blocking error when shift data fails to load — never a raw store error', async () => {
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShift').mockResolvedValue({
      ok: false,
      error: { code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' },
    })
    vi.spyOn(localOperationalStore, 'listSamplePositionsForShift').mockResolvedValue({ ok: true, value: [] })

    renderReport(buildWorkspace())

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load shift data for this report.')
  })
})
