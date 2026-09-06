import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { ok } from '@/domain/common/result'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixturePendingBatchCarryOver,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_FRONT_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { PileDetailPage } from './PileDetailPage'

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

function TestActiveShell({
  workspace,
  refreshWorkspace = () => {},
}: {
  workspace: LocalShiftWorkspace
  refreshWorkspace?: () => void
}) {
  return <Outlet context={{ workspace, refreshWorkspace } satisfies ActiveWorkspaceContext} />
}

function renderAt(path: string, workspace: LocalShiftWorkspace, refreshWorkspace?: () => void) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<TestActiveShell workspace={workspace} refreshWorkspace={refreshWorkspace} />}>
            <Route path="/piles/:pileId" element={<PileDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('PileDetailPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(localOperationalStore, 'listHaulageTransactionsForShiftPile').mockResolvedValue({ ok: true, value: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('A. resolves the real Pile from the workspace and shows the Initial Position form for a genuinely fresh Pile', async () => {
    const workspace = buildWorkspace()
    renderAt(`/piles/PILE-1?front=${FIXTURE_FRONT_ID}`, workspace)

    expect(await screen.findByRole('heading', { name: 'Pile Operation' })).toBeInTheDocument()
    // No handover carry-over for this Pile, so it is a genuinely fresh
    // Pile (post-inspection correction §6) — the old permanent blocking
    // message is gone, replaced with a default-prefilled Initial Position
    // form the operator can confirm or override, never an invented
    // silent Batch 1/Rit 1. This still proves the real Shift/Pile/
    // MasterData/store wiring resolved: a broken wiring would instead
    // show a store/context error, not this.
    expect(await screen.findByRole('heading', { name: 'Initial Position' })).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The starting batch for this new Pile has not been confirmed yet. Contact your supervisor before recording haulage.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Batch Awal')).toHaveValue('001')
    expect(screen.getByLabelText('Rit Awal')).toHaveValue('001')
  })

  it('confirming the default Initial Position persists it via the store and refreshes the workspace', async () => {
    const user = userEvent.setup()
    const workspace = buildWorkspace()
    const confirmSpy = vi
      .spyOn(localOperationalStore, 'confirmFreshPileStartPosition')
      .mockResolvedValue(ok(undefined))
    const refreshWorkspace = vi.fn()
    renderAt(`/piles/PILE-1?front=${FIXTURE_FRONT_ID}`, workspace, refreshWorkspace)

    await screen.findByRole('heading', { name: 'Initial Position' })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const [shiftId, pileId, startPosition] = confirmSpy.mock.calls[0]!
    expect(shiftId).toBe(workspace.shiftId)
    expect(pileId).toBe('PILE-1')
    expect(Number(startPosition.batchNumber)).toBe(1)
    expect(Number(startPosition.ritNumber)).toBe(1)
    expect(refreshWorkspace).toHaveBeenCalledTimes(1)
  })

  it('a Pile with CONTINUE handover carry-over never shows the Initial Position form', async () => {
    const workspace = buildWorkspace()
    const pile = workspace.piles[0]!
    const workspaceWithCarryOver: LocalShiftWorkspace = {
      ...workspace,
      pendingBatches: [buildFixturePendingBatchCarryOver(pile, 3, 18, 'CONTINUE')],
    }
    renderAt(`/piles/PILE-1?front=${FIXTURE_FRONT_ID}`, workspaceWithCarryOver)

    expect(await screen.findByRole('heading', { name: 'Pile Operation' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Initial Position' })).not.toBeInTheDocument()
  })

  it('B. an unknown PileId is handled safely with a localized message, not a crash', async () => {
    const workspace = buildWorkspace()
    renderAt('/piles/NOT-A-REAL-PILE', workspace)

    expect(await screen.findByText('This Pile is not part of the active shift workspace.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Haulage' })).not.toBeInTheDocument()
  })

  it('a missing ?front= route context shows a stable translated error and a way back to Pile selection (Phase 18 §5)', async () => {
    const workspace = buildWorkspace()
    renderAt('/piles/PILE-1', workspace)

    expect(
      await screen.findByText('The Front for this Pile is no longer valid. Choose the Front again from the Pile list.'),
    ).toBeInTheDocument()
    const backLink = screen.getByRole('link', { name: 'Back to Pile List' })
    expect(backLink).toHaveAttribute('href', '/piles')
  })

  it('a stale/unknown ?front= route context shows the same translated error, never a guessed Front', async () => {
    const workspace = buildWorkspace()
    renderAt('/piles/PILE-1?front=NOT-A-REAL-FRONT', workspace)

    expect(
      await screen.findByText('The Front for this Pile is no longer valid. Choose the Front again from the Pile list.'),
    ).toBeInTheDocument()
  })
})
