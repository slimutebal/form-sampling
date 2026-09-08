import { render, screen } from '@testing-library/react'
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
import { ProductionCorrectionsPage } from './ProductionCorrectionsPage'

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

function renderPage(batchNumber: number, ritNumber: number, transactionId: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[`/production/detail/S5_02/batch/${batchNumber}/rit/${ritNumber}/corrections?tx=${transactionId}`]}
      >
        <Routes>
          <Route element={<ActiveShell workspace={buildWorkspace()} />}>
            <Route
              path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/corrections"
              element={<ProductionCorrectionsPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function buildBaseRecord(): ProductionRecord {
  const transaction = buildFixtureHaulageTransaction({
    id: 'TX-5',
    shiftId: 'SHIFT-1',
    pile,
    batch: 4,
    rit: 5,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, createdBy: '12345' })
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

describe('ProductionCorrectionsPage', () => {
  it('shows an empty state when the record has no corrections', async () => {
    mockRecords([buildBaseRecord()])
    renderPage(4, 5, 'TX-5')
    expect(await screen.findByText('No corrections have been recorded for this record.')).toBeInTheDocument()
  })

  it('shows corrections latest first, with type/date/operator/reason and only the changed fields', async () => {
    const base = buildBaseRecord()
    const firstAfter = { ...base.effective, truckId: 'T2' }
    const secondAfter = { ...firstAfter, physicalCondition: 'WET' }
    const corrected: ProductionRecord = {
      ...base,
      effective: secondAfter,
      audit: {
        ...base.audit,
        corrections: [
          {
            id: 'CORR-1',
            type: 'EDIT_FIELDS',
            reason: 'Salah input truck',
            before: base.effective,
            after: firstAfter,
            correctedAt: new Date('2026-09-08T01:58:00.000Z'),
            correctedBy: '12345',
          },
          {
            id: 'CORR-2',
            type: 'EDIT_FIELDS',
            reason: 'Kondisi basah',
            before: firstAfter,
            after: secondAfter,
            correctedAt: new Date('2026-09-08T02:14:00.000Z'),
            correctedBy: '12345',
          },
        ],
      },
    } as unknown as ProductionRecord
    mockRecords([corrected])
    renderPage(4, 5, 'TX-5')

    const headings = await screen.findAllByText('EDIT RECORD')
    expect(headings).toHaveLength(2)

    const reasons = screen.getAllByText(/^Reason:/)
    // Latest first: the second correction ("Kondisi basah") must render before the first ("Salah input truck").
    expect(reasons[0]).toHaveTextContent('Kondisi basah')
    expect(reasons[1]).toHaveTextContent('Salah input truck')

    // Only Truck changed in the first correction — Physical Condition must not be shown for it.
    expect(screen.getByText('Truck')).toBeInTheDocument()
    expect(screen.getByText('Physical Condition')).toBeInTheDocument()
    expect(screen.queryByText(/before.*after/i)).not.toBeInTheDocument()
    expect(screen.queryByText('"batchPosition"')).not.toBeInTheDocument()
  })

  it('shows a Position change for a SWITCH_POSITION correction as "Batch X Rit Y → Batch A Rit B"', async () => {
    const base = buildBaseRecord()
    const after = {
      ...base.effective,
      batchPosition: { ...base.effective.batchPosition, batchNumber: 4, ritNumber: 9 },
    }
    const corrected: ProductionRecord = {
      ...base,
      effective: after,
      audit: {
        ...base.audit,
        corrections: [
          {
            id: 'CORR-1',
            type: 'SWITCH_POSITION',
            reason: 'Salah posisi ritase',
            before: base.effective,
            after,
            correctedAt: new Date('2026-09-08T01:58:00.000Z'),
            correctedBy: '12345',
          },
        ],
      },
    } as unknown as ProductionRecord
    mockRecords([corrected])
    renderPage(4, 9, 'TX-5')

    expect(await screen.findByText('SWITCH RECORD')).toBeInTheDocument()
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Batch 4 Rit 5 → Batch 4 Rit 9')).toBeInTheDocument()
  })
})
