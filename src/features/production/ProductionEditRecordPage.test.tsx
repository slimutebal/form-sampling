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
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { ProductionRecord } from '@/domain/production/production-record'
import i18n from '@/i18n'
import { ProductionEditRecordPage } from './ProductionEditRecordPage'

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

function renderPage(batchNumber: number, ritNumber: number, transactionId: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[`/production/detail/S5_02/batch/${batchNumber}/rit/${ritNumber}/edit?tx=${transactionId}`]}
      >
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route
              path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/edit"
              element={<ProductionEditRecordPage />}
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

function buildRecord(): ProductionRecord {
  const transaction = buildFixtureHaulageTransaction({
    id: 'TX-5',
    shiftId: 'SHIFT-1',
    pile,
    batch: 4,
    rit: 5,
    masterData,
    fleetSetup,
    truckId: FIXTURE_IN_FLEET_TRUCK_ID,
  })
  return buildFixtureProductionRecord({
    transaction,
    disposition: 'ACCEPT',
    physicalCondition: 'WET',
    contamination: 'OVR',
    remark: 'basah sedikit',
    createdBy: '12345',
  })
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

describe('ProductionEditRecordPage', () => {
  it('prefills every effective field from the selected record', async () => {
    mockRecords([buildRecord()])
    renderPage(4, 5, 'TX-5')

    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)
    expect(screen.getByText('S5_02 Batch 4 Rit 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Front No')).toHaveValue('F1')
    expect(screen.getByRole('button', { name: 'Wet' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Oversize Rock' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'ACCEPT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Remark (optional)')).toHaveValue('basah sedikit')
  })

  it('never exposes a Batch/Rit input — Switch Record is the only way to move a position', async () => {
    mockRecords([buildRecord()])
    renderPage(4, 5, 'TX-5')
    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)

    expect(screen.queryByLabelText(/batch/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^rit$/i)).not.toBeInTheDocument()
  })

  it('disables Save Changes until a reason is entered', async () => {
    mockRecords([buildRecord()])
    renderPage(4, 5, 'TX-5')
    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('saves once via updateProductionRecordWithCorrection and navigates back to the record detail', async () => {
    const user = userEvent.setup()
    mockRecords([buildRecord()])
    const updateSpy = vi
      .spyOn(localOperationalStore, 'updateProductionRecordWithCorrection')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 5, 'TX-5')
    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)

    await user.type(screen.getByLabelText('Correction Reason'), 'Salah input kondisi')
    await user.click(screen.getByRole('button', { name: 'Dry' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('rit detail')).toBeInTheDocument()
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [updated] = updateSpy.mock.calls[0]!
    expect(updated.effective.physicalCondition).toBe('DRY')
    expect(updated.audit.corrections).toHaveLength(1)
    expect(updated.audit.corrections[0]!.type).toBe('EDIT_FIELDS')
    expect(updated.audit.corrections[0]!.reason).toBe('Salah input kondisi')
  })

  it('normalizes a blank remark to null on save', async () => {
    const user = userEvent.setup()
    mockRecords([buildRecord()])
    const updateSpy = vi
      .spyOn(localOperationalStore, 'updateProductionRecordWithCorrection')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 5, 'TX-5')
    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)

    await user.clear(screen.getByPlaceholderText('Remark (optional)'))
    await user.type(screen.getByLabelText('Correction Reason'), 'Hapus keterangan')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await screen.findByText('rit detail')
    const [updated] = updateSpy.mock.calls[0]!
    expect(updated.effective.remark).toBeNull()
  })

  it('re-classifies Wrong Truck via the domain engine, never in React, when the Truck is changed', async () => {
    const user = userEvent.setup()
    mockRecords([buildRecord()])
    const updateSpy = vi
      .spyOn(localOperationalStore, 'updateProductionRecordWithCorrection')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 5, 'TX-5')
    await screen.findByText(FIXTURE_IN_FLEET_TRUCK_ID)

    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.type(screen.getByLabelText('Truck'), FIXTURE_WRONG_TRUCK_TRUCK_ID)
    await user.click(await screen.findByRole('button', { name: FIXTURE_WRONG_TRUCK_TRUCK_ID }))
    await user.type(screen.getByLabelText('Correction Reason'), 'Ganti truck')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await screen.findByText('rit detail')
    const [updated] = updateSpy.mock.calls[0]!
    expect(updated.effective.truckId).toBe(FIXTURE_WRONG_TRUCK_TRUCK_ID)
    expect(updated.effective.truckValidation.status).toBe('WRONG_TRUCK')
  })
})
