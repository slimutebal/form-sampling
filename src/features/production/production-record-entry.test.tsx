import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import type {
  AddProductionTransactionParams,
  ProductionRecordStore,
  ProductionRecordStoreError,
} from '@/application/production/production-record-store'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { Shift } from '@/domain/shift/shift'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixturePendingBatchCarryOver,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
  fixturePosition,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { ProductionRecordEntry, type ProductionRecordEntryProps } from '@/features/production/production-record-entry'

type ListResult = Result<readonly ProductionRecord[], ProductionRecordStoreError>
type AddResult = Result<void, ProductionRecordStoreError>

class FakeProductionRecordStore implements ProductionRecordStore {
  readonly addCalls: AddProductionTransactionParams[] = []
  private readonly listResult: ListResult | Promise<ListResult>
  private readonly addImpl: (params: AddProductionTransactionParams) => Promise<AddResult>

  constructor(
    listResult: ListResult | Promise<ListResult> = ok([]),
    addImpl: (params: AddProductionTransactionParams) => Promise<AddResult> = async () => ok(undefined),
  ) {
    this.listResult = listResult
    this.addImpl = addImpl
  }

  async listProductionRecordsForShiftPile(): Promise<ListResult> {
    return this.listResult
  }

  async addProductionTransaction(params: AddProductionTransactionParams): Promise<AddResult> {
    this.addCalls.push(params)
    return this.addImpl(params)
  }
}

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

const masterData: MasterData = buildFixtureMasterData()
const fleetSetup: FleetSetup = buildFixtureFleetSetup(masterData)
const pile: Pile = buildFixtureSapPile('PILE-1')
const shift: Shift = buildFixtureShift('SHIFT-1')

function renderPage(overrides: Partial<ProductionRecordEntryProps> & { store: ProductionRecordStore }) {
  const props: ProductionRecordEntryProps = {
    shift,
    pile,
    masterData,
    fleetSetup,
    manpower: [createManpowerAssignment('12345', 'John Doe', 'Checker', true)],
    pendingBatches: [buildFixturePendingBatchCarryOver(pile, 1, 1, 'CONTINUE')],
    generateTransactionId: () => 'TX-FIXED',
    now: () => new Date('2026-09-04T10:00:00.000Z'),
    ...overrides,
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/production/record/PILE-1']}>
        <Routes>
          <Route path="/production/record/:pileId" element={<ProductionRecordEntry {...props} />} />
          <Route path="/production" element={<p>Production list</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

/** Fills every field required to submit as ACCEPT (Front No, Truck, Physical Condition, Contamination). */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Front No'), 'F1')
  await user.click(await screen.findByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
  await user.click(screen.getByRole('button', { name: 'Dry' }))
  await user.click(screen.getByRole('button', { name: 'Clean' }))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ProductionRecordEntry', () => {
  it('renders the header as "RECORD <Pile_ID>" with Ore', async () => {
    renderPage({ store: new FakeProductionRecordStore() })
    expect(await screen.findByRole('heading', { name: 'RECORD PILE-1' })).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()
  })

  it('renders every required field', async () => {
    renderPage({ store: new FakeProductionRecordStore() })
    await screen.findByLabelText('Front No')

    expect(screen.getByText('Batch')).toBeInTheDocument()
    expect(screen.getByLabelText('Front No')).toBeInTheDocument()
    expect(screen.getByText('Truck')).toBeInTheDocument()
    expect(screen.getByText('Physical Condition')).toBeInTheDocument()
    expect(screen.getByText('Contamination')).toBeInTheDocument()
    expect(screen.getByText('Disposition')).toBeInTheDocument()
    expect(screen.getByText('Remark')).toBeInTheDocument()
  })

  it('defaults Disposition to ACCEPT', async () => {
    renderPage({ store: new FakeProductionRecordStore() })
    await screen.findByLabelText('Front No')

    expect(screen.getByRole('button', { name: 'ACCEPT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'REJECT' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves an ACCEPT record without any confirmation step', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore()
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.queryByText('CONFIRM REJECT')).not.toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    expect(store.addCalls[0]!.productionRecord.effective.disposition).toBe('ACCEPT')
  })

  it('opens a confirmation before saving a REJECT record', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore()
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'REJECT' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('CONFIRM REJECT')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(0)
  })

  it('cancelling the REJECT confirmation does not save', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore()
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'REJECT' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('CONFIRM REJECT')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('CONFIRM REJECT')).not.toBeInTheDocument()
    expect(store.addCalls).toHaveLength(0)
  })

  it('confirming REJECT saves exactly once', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore()
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'REJECT' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('CONFIRM REJECT')

    await user.click(screen.getByRole('button', { name: 'Reject & Save' }))

    expect(store.addCalls).toHaveLength(1)
    expect(store.addCalls[0]!.productionRecord.effective.disposition).toBe('REJECT')
  })

  it('Batal returns to the Production > Record Pile list without saving', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore()
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Production list')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(0)
  })

  it('does not duplicate the save on a rapid double tap', async () => {
    const user = userEvent.setup()
    const store = new FakeProductionRecordStore(ok([]), () => neverResolves())
    renderPage({ store })
    await screen.findByLabelText('Front No')

    await fillRequiredFields(user)
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)

    expect(store.addCalls).toHaveLength(1)
  })

  describe('missed-Rit correction target', () => {
    function recordAt(id: string, rit: number, disposition: 'ACCEPT' | 'REJECT') {
      const transaction = buildFixtureHaulageTransaction({
        id,
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit,
        masterData,
        fleetSetup,
      })
      return buildFixtureProductionRecord({ transaction, disposition })
    }

    it('targets the exact missed Batch/Rit instead of the auto-derived next position, and shows a correction banner', async () => {
      // Rit 2 is missed: only ACCEPT at 1 and 3.
      const history = [recordAt('TX-1', 1, 'ACCEPT'), recordAt('TX-3', 3, 'ACCEPT')]
      const store = new FakeProductionRecordStore(ok(history))
      renderPage({ store, targetPosition: fixturePosition(1, 2) })
      await screen.findByLabelText('Front No')

      expect(screen.getByText('Missed Rit correction: Batch 1 • Rit 2')).toBeInTheDocument()
      // The Batch/Rit info card reflects the target, not the auto-derived next position (which would be Rit 4).
      const batchValue = screen.getByText('Batch').nextElementSibling
      const ritValue = screen.getByText('Rit').nextElementSibling
      expect(batchValue).toHaveTextContent('1')
      expect(ritValue).toHaveTextContent('2')
    })

    it('saves the target position when confirmed still missed', async () => {
      const user = userEvent.setup()
      const history = [recordAt('TX-1', 1, 'ACCEPT'), recordAt('TX-3', 3, 'ACCEPT')]
      const store = new FakeProductionRecordStore(ok(history))
      renderPage({ store, targetPosition: fixturePosition(1, 2) })
      await screen.findByLabelText('Front No')

      await fillRequiredFields(user)
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(store.addCalls).toHaveLength(1)
      expect(store.addCalls[0]!.transaction.batchPosition).toEqual(fixturePosition(1, 2))
    })

    it('blocks the save with an explicit message when the target is no longer missed', async () => {
      // Rit 2 is already filled — nothing is missed.
      const history = [recordAt('TX-1', 1, 'ACCEPT'), recordAt('TX-2', 2, 'ACCEPT'), recordAt('TX-3', 3, 'ACCEPT')]
      const store = new FakeProductionRecordStore(ok(history))
      renderPage({ store, targetPosition: fixturePosition(1, 2) })

      expect(await screen.findByText('This position is no longer missed. It may already have been recorded from another device.')).toBeInTheDocument()
      expect(screen.queryByLabelText('Front No')).not.toBeInTheDocument()
    })
  })
})
