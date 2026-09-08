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
  FIXTURE_FRONT_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import type { ProductionRecord } from '@/domain/production/production-record'
import i18n from '@/i18n'
import { ProductionRitDetailPage } from './ProductionRitDetailPage'

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

function renderPage(batchNumber: number, ritNumber: number) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/production/detail/S5_02/batch/${batchNumber}/rit/${ritNumber}`]}>
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route
              path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber"
              element={<ProductionRitDetailPage />}
            />
          </Route>
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function record(
  id: string,
  rit: number,
  disposition: 'ACCEPT' | 'REJECT',
  batch = 4,
  options: { truckId?: string; physicalCondition?: 'DRY' | 'MOIST' | 'WET' | 'MUDDY'; contamination?: 'CLN' | 'OVR' | 'OGC' | 'TRH' } = {},
) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
    truckId: options.truckId,
  })
  return buildFixtureProductionRecord({
    transaction,
    disposition,
    physicalCondition: options.physicalCondition ?? 'DRY',
    contamination: options.contamination ?? 'OVR',
    createdAt: RECORDED_AT,
    createdBy: '12345',
  })
}

// Noon UTC keeps the calendar date stable across any real-world runner
// timezone (-12..+14), so the "08 Sep 2026" date part is deterministic;
// the expected time-of-day below is derived from this same Date's own
// local getHours()/getMinutes(), mirroring exactly how the component
// formats it — never a hardcoded assumption about the runner's timezone.
const RECORDED_AT = new Date('2026-09-08T12:00:00.000Z')
const EXPECTED_RECORDED_AT_TEXT = `08 Sep 2026 • ${String(RECORDED_AT.getHours()).padStart(2, '0')}:${String(RECORDED_AT.getMinutes()).padStart(2, '0')}`

function mockRecords(records: readonly ProductionRecord[]) {
  vi.spyOn(localOperationalStore, 'listProductionRecordsForShift').mockResolvedValue({ ok: true, value: records })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProductionRitDetailPage', () => {
  it('uses the full "{Pile_ID} Batch {N} Rit {R}" header text', async () => {
    mockRecords([record('TX-5', 5, 'ACCEPT', 4)])
    renderPage(4, 5)
    expect(await screen.findByRole('heading', { name: 'S5_02 Batch 4 Rit 5' })).toBeInTheDocument()
  })

  it('renders every ACCEPT record field: truck, front, physical condition, contamination, disposition, sampling, truck validation, remark, recorder', async () => {
    mockRecords([record('TX-5', 5, 'ACCEPT', 4, { truckId: FIXTURE_IN_FLEET_TRUCK_ID, physicalCondition: 'DRY', contamination: 'OVR' })])
    renderPage(4, 5)

    expect(await screen.findByText('Truck')).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_IN_FLEET_TRUCK_ID)).toBeInTheDocument()
    expect(screen.getByText('Front')).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_FRONT_ID)).toBeInTheDocument()
    expect(screen.getByText('Physical Condition')).toBeInTheDocument()
    expect(screen.getByText('DRY — Dry')).toBeInTheDocument()
    expect(screen.getByText('Contamination')).toBeInTheDocument()
    expect(screen.getByText('OVR — Oversize Rock')).toBeInTheDocument()
    expect(screen.getByText('Disposition')).toBeInTheDocument()
    expect(screen.getByText('ACCEPT')).toBeInTheDocument()
    expect(screen.getByText('Sampling')).toBeInTheDocument()
    expect(screen.getByText('NO SAMPLE')).toBeInTheDocument()
    expect(screen.getByText('Truck Validation')).toBeInTheDocument()
    expect(screen.getByText('VALID')).toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
    expect(screen.getByText('Recorded By')).toBeInTheDocument()
    expect(screen.getByText('12345')).toBeInTheDocument()
    expect(screen.getByText('Recorded At')).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_RECORDED_AT_TEXT)).toBeInTheDocument()
  })

  it('an ACCEPT + ACTIVE record shows compact Edit/Switch/Delete actions, each targeting this exact record', async () => {
    mockRecords([record('TX-5', 5, 'ACCEPT', 4)])
    renderPage(4, 5)
    await screen.findByText('Truck')

    const editLink = screen.getByRole('link', { name: 'Edit' })
    expect(editLink).toHaveAttribute(
      'href',
      '/production/detail/S5_02/batch/4/rit/5/edit?tx=TX-5',
    )
    const switchLink = screen.getByRole('link', { name: 'Switch' })
    expect(switchLink).toHaveAttribute(
      'href',
      '/production/detail/S5_02/batch/4/rit/5/switch?tx=TX-5',
    )
    expect(screen.getByRole('button', { name: 'Delete Record' })).toBeInTheDocument()
  })

  it('does not show a CORRECTED badge or Correction History link for a never-corrected record', async () => {
    mockRecords([record('TX-5', 5, 'ACCEPT', 4)])
    renderPage(4, 5)
    await screen.findByText('Truck')
    expect(screen.queryByText('CORRECTED')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Correction History' })).not.toBeInTheDocument()
  })

  it('shows a CORRECTED badge and Correction History link once a record has at least one correction', async () => {
    const base = record('TX-5', 5, 'ACCEPT', 4)
    const corrected: ProductionRecord = {
      ...base,
      audit: {
        ...base.audit,
        corrections: [
          {
            id: 'CORR-1',
            type: 'EDIT_FIELDS',
            reason: 'Salah input truck',
            before: base.effective,
            after: base.effective,
            correctedAt: new Date('2026-09-08T02:14:00.000Z'),
            correctedBy: '12345',
          },
        ],
      },
    } as unknown as ProductionRecord
    mockRecords([corrected])
    renderPage(4, 5)
    await screen.findByText('Truck')
    expect(screen.getByText('CORRECTED')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Correction History' })
    expect(link).toHaveAttribute('href', '/production/detail/S5_02/batch/4/rit/5/corrections?tx=TX-5')
  })

  it('tapping Delete Record opens a VOID confirmation that explains this is not a permanent delete, and requires a reason', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-5', 5, 'ACCEPT', 4, { truckId: FIXTURE_IN_FLEET_TRUCK_ID })])
    const voidSpy = vi
      .spyOn(localOperationalStore, 'voidProductionRecord')
      .mockResolvedValue({ ok: true, value: undefined })
    renderPage(4, 5)
    await screen.findByText('Truck')

    await user.click(screen.getByRole('button', { name: 'Delete Record' }))

    expect(await screen.findByRole('heading', { name: 'VOID RECORD' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'This record will not be permanently deleted. It will be deactivated and remains available in the audit history.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_IN_FLEET_TRUCK_ID)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: 'Void Record' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText('Correction Reason'), 'Salah catat')
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    expect(voidSpy).toHaveBeenCalledTimes(1)
    const [voided] = voidSpy.mock.calls[0]!
    expect(voided.effective.status).toBe('VOIDED')
    expect(voided.audit.corrections).toHaveLength(1)
    expect(voided.audit.corrections[0]!.type).toBe('VOID_RECORD')
    expect(voided.audit.corrections[0]!.reason).toBe('Salah catat')
  })

  it('cancelling the VOID confirmation performs no write and returns to the record detail', async () => {
    const user = userEvent.setup()
    mockRecords([record('TX-5', 5, 'ACCEPT', 4)])
    const voidSpy = vi.spyOn(localOperationalStore, 'voidProductionRecord')
    renderPage(4, 5)
    await screen.findByText('Truck')

    await user.click(screen.getByRole('button', { name: 'Delete Record' }))
    await screen.findByRole('heading', { name: 'VOID RECORD' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Truck')).toBeInTheDocument()
    expect(voidSpy).not.toHaveBeenCalled()
  })

  it('a REJECT + ACTIVE attempt at an open (not-yet-reached, not missed) position shows Edit + Delete, never Switch', async () => {
    mockRecords([record('TX-2', 2, 'REJECT', 4, { truckId: FIXTURE_IN_FLEET_TRUCK_ID })])
    renderPage(4, 2)

    expect(await screen.findByText('This position has no ACCEPT record yet.')).toBeInTheDocument()
    const editLink = screen.getByRole('link', { name: 'Edit' })
    expect(editLink).toHaveAttribute('href', '/production/detail/S5_02/batch/4/rit/2/edit?tx=TX-2')
    expect(screen.getByRole('button', { name: 'Delete Record' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Switch' })).not.toBeInTheDocument()
  })

  it('a VOIDED record shows no active correction action, but remains reachable via Correction History', async () => {
    const base = record('TX-1', 1, 'ACCEPT', 4)
    const voided: ProductionRecord = {
      ...base,
      effective: { ...base.effective, status: 'VOIDED' },
      audit: {
        ...base.audit,
        corrections: [
          {
            id: 'CORR-1',
            type: 'VOID_RECORD',
            reason: 'Salah catat',
            before: base.effective,
            after: { ...base.effective, status: 'VOIDED' },
            correctedAt: new Date('2026-09-08T02:14:00.000Z'),
            correctedBy: '12345',
          },
        ],
      },
    } as unknown as ProductionRecord
    mockRecords([voided])
    renderPage(4, 1)

    expect(await screen.findByText('VOIDED')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Correction History' })).toHaveAttribute(
      'href',
      '/production/detail/S5_02/batch/4/rit/1/corrections?tx=TX-1',
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Switch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Record' })).not.toBeInTheDocument()
  })

  it('renders the MISSED RITASE warning with every REJECT attempt preserved, and no per-attempt Edit/Delete action', async () => {
    mockRecords([
      record('TX-1', 1, 'ACCEPT', 4),
      record('TX-2A', 2, 'REJECT', 4, { truckId: FIXTURE_IN_FLEET_TRUCK_ID, physicalCondition: 'WET', contamination: 'OVR' }),
      record('TX-2B', 2, 'REJECT', 4, { truckId: FIXTURE_IN_FLEET_TRUCK_ID, physicalCondition: 'MUDDY', contamination: 'CLN' }),
      record('TX-3', 3, 'ACCEPT', 4),
    ])
    renderPage(4, 2)

    expect(await screen.findByText('⚠ MISSED RITASE')).toBeInTheDocument()
    expect(screen.getByText(`${FIXTURE_IN_FLEET_TRUCK_ID} • REJECT • WET • OVR`)).toBeInTheDocument()
    expect(screen.getByText(`${FIXTURE_IN_FLEET_TRUCK_ID} • REJECT • MUDDY • CLN`)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Record' })).not.toBeInTheDocument()
  })

  it('MISSED shows both "Record This Rit" and "Switch Existing Record", the operator never typing a Rit value', async () => {
    mockRecords([record('TX-1', 1, 'ACCEPT', 4), record('TX-2', 2, 'REJECT', 4), record('TX-3', 3, 'ACCEPT', 4)])
    renderPage(4, 2)

    const recordHereLink = await screen.findByRole('link', { name: 'Record This Rit' })
    expect(recordHereLink).toHaveAttribute('href', '/production/record/S5_02?batch=4&rit=2&mode=missed')

    const switchExistingLink = screen.getByRole('link', { name: 'Switch Existing Record' })
    expect(switchExistingLink).toHaveAttribute('href', '/production/detail/S5_02/batch/4/rit/2/switch')
    // No manual Rit input control exists anywhere on this screen.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /rit/i })).not.toBeInTheDocument()
  })
})
