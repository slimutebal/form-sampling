import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { ProductionRecord } from '@/domain/production/production-record'
import i18n from '@/i18n'
import { ProductionSwitchRecordPage } from './ProductionSwitchRecordPage'

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
    manpower: [createManpowerAssignment('12345', 'John Doe', 'Checker', true)],
  }
}

function ActiveShell({ workspace }: { workspace: LocalShiftWorkspace }) {
  return <Outlet context={{ workspace, refreshWorkspace: () => {} } satisfies ActiveWorkspaceContext} />
}

function renderPage(batchNumber: number, ritNumber: number, transactionId?: string) {
  const query = transactionId ? `?tx=${transactionId}` : ''
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/production/detail/S5_02/batch/${batchNumber}/rit/${ritNumber}/switch${query}`]}>
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route
              path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/switch"
              element={<ProductionSwitchRecordPage />}
            />
            <Route
              path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber"
              element={<p>rit detail</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function record(id: string, batch: number, rit: number, disposition: 'ACCEPT' | 'REJECT' = 'ACCEPT') {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
    truckId: FIXTURE_IN_FLEET_TRUCK_ID,
  })
  return buildFixtureProductionRecord({ transaction, disposition, createdBy: '12345' })
}

function mockRecords(records: readonly ProductionRecord[]) {
  vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
}

async function selectTarget(user: ReturnType<typeof userEvent.setup>, batch: number, rit: number) {
  await user.selectOptions(screen.getByLabelText('Target Batch'), String(batch))
  await user.selectOptions(screen.getByLabelText('Target Rit'), String(rit))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProductionSwitchRecordPage — from a source record (MOVE/SWAP)', () => {
  it('plans a MOVE when the target position is empty, and no arbitrary Rit text input exists', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-1', 4, 1)])
    renderPage(4, 1, 'TX-1')

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Target Batch').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Target Rit').tagName).toBe('SELECT')

    await selectTarget(user, 4, 9)
    expect(await screen.findByText('AVAILABLE')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correction Reason'), 'Salah posisi ritase')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))

    expect(await screen.findByText('MOVE')).toBeInTheDocument()
  })

  it('plans a SWAP when the target position is occupied, showing the occupant truck', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-1', 4, 1), record('TX-2', 4, 9)])
    renderPage(4, 1, 'TX-1')

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    await selectTarget(user, 4, 9)

    expect(await screen.findByText(`OCCUPIED — ${FIXTURE_IN_FLEET_TRUCK_ID} — records will be exchanged`)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correction Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))

    expect(await screen.findByText('SWAP')).toBeInTheDocument()
  })

  it('shows a Sample Impact warning only when the effective sampling requirement changes, and confirming writes exactly once', async () => {
    const user = userEvent.setup()
    // SAP fixture interval 2: Rit 4 is a sample point, Rit 5 is not.
    mockRecords([record('TX-1', 4, 4)])
    const switchSpy = vi
      .spyOn(localOperationalStore, 'switchProductionRecords')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 4, 'TX-1')

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    await selectTarget(user, 4, 5)
    await user.type(screen.getByLabelText('Correction Reason'), 'Salah posisi ritase')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))

    expect(await screen.findByText('⚠ SAMPLE IMPACT')).toBeInTheDocument()
    expect(screen.getByText('This position change alters the sampling requirement.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue Correction' }))

    expect(await screen.findByText('rit detail')).toBeInTheDocument()
    expect(switchSpy).toHaveBeenCalledTimes(1)
    const [params] = switchSpy.mock.calls[0]!
    expect(Number(params.updatedSource.effective.batchPosition.ritNumber)).toBe(5)
    expect(params.updatedTarget).toBeUndefined()
  })

  it('does not show a Sample Impact warning when the requirement does not change', async () => {
    const user = userEvent.setup()
    // Rit 1 -> Rit 9: both NO SAMPLE under interval 2.
    mockRecords([record('TX-1', 4, 1)])
    vi.spyOn(localOperationalStore, 'switchProductionRecords').mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 1, 'TX-1')

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    await selectTarget(user, 4, 9)
    await user.type(screen.getByLabelText('Correction Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))

    await screen.findByText('MOVE')
    expect(screen.queryByText('⚠ SAMPLE IMPACT')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Switch' })).toBeInTheDocument()
  })

  it('cancelling the Sample Impact confirmation performs no write', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-1', 4, 4)])
    const switchSpy = vi.spyOn(localOperationalStore, 'switchProductionRecords')
    renderPage(4, 4, 'TX-1')

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    await selectTarget(user, 4, 5)
    await user.type(screen.getByLabelText('Correction Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))
    await screen.findByText('⚠ SAMPLE IMPACT')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: 'Preview Switch' })).toBeInTheDocument()
    expect(switchSpy).not.toHaveBeenCalled()
  })
})

describe('ProductionSwitchRecordPage — MISSED "Switch Existing Record" (target fixed, pick source)', () => {
  it('lets the operator pick an existing ACCEPT + ACTIVE source and performs a MOVE into the fixed target', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-5', 4, 5)])
    const switchSpy = vi
      .spyOn(localOperationalStore, 'switchProductionRecords')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 3)

    await screen.findByRole('heading', { name: 'SWITCH RECORD' })
    expect(screen.getByText('S5_02 Batch 4 Rit 3')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Select an existing record'), 'TX-5')
    await user.type(screen.getByLabelText('Correction Reason'), 'Salah posisi ritase')
    await user.click(screen.getByRole('button', { name: 'Preview Switch' }))

    expect(await screen.findByText('MOVE')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm Switch' }))

    expect(await screen.findByText('rit detail')).toBeInTheDocument()
    expect(switchSpy).toHaveBeenCalledTimes(1)
    const [params] = switchSpy.mock.calls[0]!
    expect(Number(params.updatedSource.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(params.updatedSource.effective.batchPosition.ritNumber)).toBe(3)
  })
})
