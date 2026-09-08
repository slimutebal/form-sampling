import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeliveryDestinationOption } from '@/application/sample-handling/delivery-destination'
import type { SampleHandlingStore, SampleHandlingStoreError } from '@/application/sample-handling/sample-handling-store'
import { parseOreCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createPile, type Pile } from '@/domain/pile/pile'
import { createLegacyProductionRecord, type ProductionRecord } from '@/domain/production/production-record'
import { createDeliveredDelivery } from '@/domain/sample-handling/delivery-status'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_EMPLOYEE_NAME,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import i18n from '@/i18n'
import { SampleHandlingPage, type SampleHandlingPageProps } from '@/features/samples/sample-handling-page'

type ListHaulageResult = Result<readonly HaulageTransaction[], SampleHandlingStoreError>
type ListProductionRecordsResult = Result<readonly ProductionRecord[], SampleHandlingStoreError>
type ListSampleResult = Result<readonly SamplePosition[], SampleHandlingStoreError>
type AddResult = Result<void, SampleHandlingStoreError>

/**
 * Defaults `listProductionRecordsForShift` to a legacy ACCEPT + ACTIVE
 * ProductionRecord per haulage-result transaction (via
 * `createLegacyProductionRecord`) so every existing pending-sample
 * assertion in this suite — written against `haulageResult` alone,
 * before Phase 2 introduced ProductionRecord-based eligibility — keeps
 * working unchanged. Pass an explicit `productionRecordsResult` only for
 * a test that needs REJECT/non-legacy disposition behavior.
 */
class FakeSampleHandlingStore implements SampleHandlingStore {
  readonly addCalls: SamplePosition[] = []
  private readonly haulageResult: ListHaulageResult | Promise<ListHaulageResult>
  private readonly sampleResult: ListSampleResult | Promise<ListSampleResult>
  private readonly addImpl: (position: SamplePosition) => Promise<AddResult>
  private readonly productionRecordsResult?: ListProductionRecordsResult | Promise<ListProductionRecordsResult>

  constructor(
    haulageResult: ListHaulageResult | Promise<ListHaulageResult>,
    sampleResult: ListSampleResult | Promise<ListSampleResult>,
    addImpl: (position: SamplePosition) => Promise<AddResult> = async () => ok(undefined),
    productionRecordsResult?: ListProductionRecordsResult | Promise<ListProductionRecordsResult>,
  ) {
    this.haulageResult = haulageResult
    this.sampleResult = sampleResult
    this.addImpl = addImpl
    this.productionRecordsResult = productionRecordsResult
  }

  async listHaulageTransactionsForShift(): Promise<ListHaulageResult> {
    return this.haulageResult
  }

  async listProductionRecordsForShift(): Promise<ListProductionRecordsResult> {
    if (this.productionRecordsResult) {
      return this.productionRecordsResult
    }
    const haulage = await this.haulageResult
    if (!haulage.ok) {
      return haulage
    }
    return ok(haulage.value.map((transaction) => createLegacyProductionRecord(transaction)))
  }

  async listSamplePositionsForShift(): Promise<ListSampleResult> {
    return this.sampleResult
  }

  async addSamplePosition(position: SamplePosition): Promise<AddResult> {
    this.addCalls.push(position)
    return this.addImpl(position)
  }
}

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

const masterData: MasterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile: Pile = buildFixtureSapPile('PILE-1')
const shift: Shift = buildFixtureShift('SHIFT-1')
const deliveryDestinations: readonly DeliveryDestinationOption[] = [
  { code: 'LAB-A', label: 'LAB-A' },
  { code: 'LAB-B', label: 'LAB-B' },
]

function sampleRequiredTransaction(id: string, rit: number) {
  return buildFixtureHaulageTransaction({ id, shiftId: 'SHIFT-1', pile, batch: 24, rit, masterData, fleetSetup })
}

function renderPage(overrides: Partial<SampleHandlingPageProps> & { store: SampleHandlingStore }) {
  const props: SampleHandlingPageProps = {
    shift,
    piles: [pile],
    masterData,
    deliveryDestinations,
    generateSamplePositionId: () => 'SP-FIXED',
    ...overrides,
  }
  return render(<SampleHandlingPage {...props} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('SampleHandlingPage', () => {
  it('A. shows a loading state before the reads resolve', () => {
    renderPage({ store: new FakeSampleHandlingStore(neverResolves(), neverResolves()) })
    expect(screen.getByText('Loading Samples…')).toBeInTheDocument()
  })

  it('B. a load failure shows a translated message with Retry, never a silent empty state', async () => {
    renderPage({
      store: new FakeSampleHandlingStore(
        err({ code: 'LOCAL_DATABASE_OPERATION_FAILED' }),
        ok([]),
      ),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load sample data for this shift.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('C. a pending sample card renders with Pile, Ore, Batch, and pending sampled Rits', async () => {
    renderPage({
      store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])),
    })
    expect(await screen.findByText('PILE-1', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('SAP', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'p' })).toBeInTheDocument()
  })

  it('D. only Piles with pending samples are offered in the Pile selector', async () => {
    const otherPile = buildFixtureSapPile('PILE-2')
    renderPage({
      store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])),
      piles: [pile, otherPile],
    })
    const pileSelect = await screen.findByLabelText('Pile')
    expect(within(pileSelect).getByRole('option', { name: 'PILE-1' })).toBeInTheDocument()
    expect(within(pileSelect).queryByRole('option', { name: 'PILE-2' })).not.toBeInTheDocument()
  })

  it('E. Ore is shown read-only/automatic once a Pile is selected', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])) })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    expect(screen.queryByLabelText('Ore')).not.toBeInTheDocument()
    expect(screen.getByTestId('selected-ore')).toHaveTextContent('SAP')
  })

  it('F. Batch options come from the pending data for the selected Pile', async () => {
    const user = userEvent.setup()
    renderPage({
      store: new FakeSampleHandlingStore(
        ok([sampleRequiredTransaction('TX-1', 2), sampleRequiredTransaction('TX-2', 4)]),
        ok([]),
      ),
    })
    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    const batchSelect = screen.getByLabelText('Batch')
    expect(within(batchSelect).getByRole('option', { name: '24' })).toBeInTheDocument()
  })

  it('G/H. Rit From/To selectors are offered', async () => {
    const user = userEvent.setup()
    renderPage({
      store: new FakeSampleHandlingStore(
        ok([sampleRequiredTransaction('TX-1', 2), sampleRequiredTransaction('TX-2', 4)]),
        ok([]),
      ),
    })
    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')

    expect(screen.getByLabelText('Rit From')).toBeInTheDocument()
    expect(screen.getByLabelText('Rit To')).toBeInTheDocument()
  })

  it('H. a SAP range preview shows Sample Range and Total Bag', async () => {
    const user = userEvent.setup()
    renderPage({
      store: new FakeSampleHandlingStore(
        ok([sampleRequiredTransaction('TX-1', 2), sampleRequiredTransaction('TX-2', 4)]),
        ok([]),
      ),
    })
    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '4')

    expect(screen.getByText('Sample Range')).toBeInTheDocument()
    expect(screen.getByTestId('sample-range-value')).toHaveTextContent('2, 4')
    expect(screen.getByText('Total Bag')).toBeInTheDocument()
    expect(screen.getByTestId('total-bag-value')).toHaveTextContent('2')
  })

  it('I. a LIM fractional Total Bag is shown without rounding', async () => {
    const user = userEvent.setup()
    const limOreCode = parseOreCode('LIM')
    const limPileId = parsePileId('PILE-LIM')
    if (!limOreCode.ok || !limPileId.ok) throw new Error('invalid test fixture')
    const limPile = createPile(limPileId.value, limOreCode.value)

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-LIM-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      rit: 5,
      masterData,
      fleetSetup,
    })

    renderPage({
      store: new FakeSampleHandlingStore(ok([transaction]), ok([])),
      piles: [limPile],
    })
    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-LIM')
    await user.selectOptions(screen.getByLabelText('Batch'), '1')
    await user.selectOptions(screen.getByLabelText('Rit From'), '5')
    await user.selectOptions(screen.getByLabelText('Rit To'), '5')

    expect(screen.getByTestId('total-bag-value')).toHaveTextContent('0.5')
  })

  it('J. a candidate range that would re-cover an already-handled Rit inside its span blocks save with a translated overlap message', async () => {
    // Rit 4 is already handled by an existing position; only 2, 6, 8
    // remain pending. Selecting the pending boundary 2 -> 8 generates
    // the sampled sequence [2, 4, 6, 8] — re-covering the already-handled
    // Rit 4 even though 4 itself is no longer offered as a boundary.
    const user = userEvent.setup()
    const existing = buildFixtureSamplePosition({
      id: 'SP-EXISTING',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 4,
      ritTo: 4,
      masterData,
      delivery: { status: 'NOT_PICKED_UP' },
    })
    renderPage({
      store: new FakeSampleHandlingStore(
        ok([
          sampleRequiredTransaction('TX-1', 2),
          sampleRequiredTransaction('TX-2', 4),
          sampleRequiredTransaction('TX-3', 6),
          sampleRequiredTransaction('TX-4', 8),
        ]),
        ok([existing]),
      ),
    })
    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '8')

    expect(await screen.findByText('Sample range overlaps an existing sample position.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Sample Position' })).toBeDisabled()
  })

  it('K. NOT_PICKED_UP saves without a destination', async () => {
    const user = userEvent.setup()
    const store = new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([]))
    renderPage({ store })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.click(screen.getByRole('button', { name: 'Save Sample Position' }))

    expect(await screen.findByText('Sample position saved')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    expect(store.addCalls[0]?.delivery).toEqual({ status: 'NOT_PICKED_UP' })
  })

  it('L. DELIVERED requires a destination before Save is enabled', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])) })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')

    expect(screen.getByRole('button', { name: 'Save Sample Position' })).toBeDisabled()
  })

  it('M. Deliver To options come from the caller-supplied destination catalog', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])) })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')

    const destinationSelect = screen.getByLabelText('Deliver To')
    expect(within(destinationSelect).getByRole('option', { name: 'LAB-A' })).toBeInTheDocument()
    expect(within(destinationSelect).getByRole('option', { name: 'LAB-B' })).toBeInTheDocument()
  })

  it('N. Dispatcher comes from the employee master and shows id + name', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])) })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')

    const dispatcherSelect = screen.getByLabelText('Dispatcher')
    expect(
      within(dispatcherSelect).getByRole('option', { name: `${FIXTURE_EMPLOYEE_ID} — ${FIXTURE_EMPLOYEE_NAME}` }),
    ).toBeInTheDocument()
  })

  it('O. switching DELIVERED back to NOT_PICKED_UP clears destination and dispatcher', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([])) })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')
    await user.selectOptions(screen.getByLabelText('Deliver To'), 'LAB-A')
    await user.selectOptions(screen.getByLabelText('Dispatcher'), FIXTURE_EMPLOYEE_ID)

    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'NOT_PICKED_UP')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')

    expect(screen.getByLabelText('Deliver To')).toHaveValue('')
    expect(screen.getByLabelText('Dispatcher')).toHaveValue('')
  })

  it('P. save success calls the store once, recalculates pending, shows the handled position, and gives success feedback', async () => {
    const user = userEvent.setup()
    const store = new FakeSampleHandlingStore(
      ok([sampleRequiredTransaction('TX-1', 2), sampleRequiredTransaction('TX-2', 4)]),
      ok([]),
    )
    renderPage({ store })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '4')
    await user.click(screen.getByRole('button', { name: 'Save Sample Position' }))

    expect(await screen.findByText('Sample position saved')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    // Pending is recalculated: both sampled Rits are now handled.
    expect(screen.getByText('No samples to handle yet. Samples appear automatically once a sampling rit is recorded on a Pile.')).toBeInTheDocument()
  })

  it('Q. save failure leaves pending unchanged, shows a translated error, and never a raw message', async () => {
    const user = userEvent.setup()
    const store = new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([]), async () =>
      err({ code: 'DUPLICATE_SAMPLE_POSITION_ID' }),
    )
    renderPage({ store })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.click(screen.getByRole('button', { name: 'Save Sample Position' }))

    expect(await screen.findByText('This sample position was already saved.')).toBeInTheDocument()
    // Pending was not recalculated away — the count stays at 1 and the
    // failed write was never appended to the store's add calls beyond
    // the single attempt.
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1')
    expect(store.addCalls).toHaveLength(1)
  })

  it('R. double-submit generates one id and issues one store write', async () => {
    const user = userEvent.setup()
    let resolveAdd: (result: AddResult) => void = () => {}
    const pending = new Promise<AddResult>((resolve) => {
      resolveAdd = resolve
    })
    const store = new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([]), async () => pending)
    let generateCalls = 0
    renderPage({
      store,
      generateSamplePositionId: () => {
        generateCalls += 1
        return 'SP-FIXED'
      },
    })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')

    const button = screen.getByRole('button', { name: 'Save Sample Position' })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Saving…' }))

    expect(generateCalls).toBe(1)
    expect(store.addCalls).toHaveLength(1)

    resolveAdd(ok(undefined))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument()
    })
  })

  it('S. never displays a raw StoreError/DomainError message', async () => {
    renderPage({
      store: new FakeSampleHandlingStore(err({ code: 'SHIFT_WORKSPACE_NOT_FOUND' }), ok([])),
    })
    await screen.findByRole('alert')
    expect(screen.queryByText(/diagnostic/)).not.toBeInTheDocument()
  })

  it('U. the Pending counter sums pending sampled Rit numbers across batches, not batch groups', async () => {
    // Batch 24 has 2 pending Rits (2, 4); Batch 25 has 1 pending Rit
    // (2). Two batch groups but three pending Rits total — the counter
    // must show 3, not 2.
    const transactions = [
      sampleRequiredTransaction('TX-1', 2),
      sampleRequiredTransaction('TX-2', 4),
      buildFixtureHaulageTransaction({
        id: 'TX-3',
        shiftId: 'SHIFT-1',
        pile,
        batch: 25,
        rit: 2,
        masterData,
        fleetSetup,
      }),
    ]
    renderPage({ store: new FakeSampleHandlingStore(ok(transactions), ok([])) })

    expect(await screen.findByTestId('pending-count')).toHaveTextContent('3')
  })

  it('V. a stale destination (removed from the catalog after selection) disables Save and blocks id generation/store write', async () => {
    const user = userEvent.setup()
    const store = new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([]))
    let generateCalls = 0
    const generateSamplePositionId = () => {
      generateCalls += 1
      return 'SP-SHOULD-NOT-BE-GENERATED'
    }
    const { rerender } = renderPage({ store, generateSamplePositionId })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')
    await user.selectOptions(screen.getByLabelText('Deliver To'), 'LAB-A')
    expect(screen.getByRole('button', { name: 'Save Sample Position' })).toBeEnabled()

    // Simulate the destination catalog changing (e.g. re-supplied by the
    // caller) while the page's own destination selection state still
    // holds the now-stale code.
    rerender(
      <SampleHandlingPage
        shift={shift}
        piles={[pile]}
        masterData={masterData}
        deliveryDestinations={[{ code: 'LAB-B', label: 'LAB-B' }]}
        store={store}
        generateSamplePositionId={generateSamplePositionId}
      />,
    )

    const saveButton = screen.getByRole('button', { name: 'Save Sample Position' })
    expect(saveButton).toBeDisabled()

    // Clicking a disabled button fires no submit — this proves the
    // guard holds even when the UI is driven directly, not merely that
    // a human would be prevented from clicking it.
    await user.click(saveButton)

    expect(generateCalls).toBe(0)
    expect(store.addCalls).toHaveLength(0)
  })

  it('W. a stale dispatcher (removed from the employee master after selection) disables Save and blocks id generation/store write', async () => {
    const user = userEvent.setup()
    const store = new FakeSampleHandlingStore(ok([sampleRequiredTransaction('TX-1', 2)]), ok([]))
    let generateCalls = 0
    const generateSamplePositionId = () => {
      generateCalls += 1
      return 'SP-SHOULD-NOT-BE-GENERATED'
    }
    const { rerender } = renderPage({ store, generateSamplePositionId })

    const pileSelect = await screen.findByLabelText('Pile')
    await user.selectOptions(pileSelect, 'PILE-1')
    await user.selectOptions(screen.getByLabelText('Batch'), '24')
    await user.selectOptions(screen.getByLabelText('Rit From'), '2')
    await user.selectOptions(screen.getByLabelText('Rit To'), '2')
    await user.selectOptions(screen.getByLabelText('Delivery Status'), 'DELIVERED')
    await user.selectOptions(screen.getByLabelText('Deliver To'), 'LAB-A')
    await user.selectOptions(screen.getByLabelText('Dispatcher'), FIXTURE_EMPLOYEE_ID)
    expect(screen.getByRole('button', { name: 'Save Sample Position' })).toBeEnabled()

    // Simulate the employee master changing (the previously-selected
    // Dispatcher no longer exists) while the page's own dispatcher
    // selection state still holds the now-stale EmployeeId.
    const masterDataWithoutDispatcherResult = createMasterData({ ...masterData, employees: [] })
    if (!masterDataWithoutDispatcherResult.ok) throw new Error('invalid test fixture')
    const masterDataWithoutDispatcher = masterDataWithoutDispatcherResult.value

    rerender(
      <SampleHandlingPage
        shift={shift}
        piles={[pile]}
        masterData={masterDataWithoutDispatcher}
        deliveryDestinations={deliveryDestinations}
        store={store}
        generateSamplePositionId={generateSamplePositionId}
      />,
    )

    const saveButton = screen.getByRole('button', { name: 'Save Sample Position' })
    expect(saveButton).toBeDisabled()

    await user.click(saveButton)

    expect(generateCalls).toBe(0)
    expect(store.addCalls).toHaveLength(0)
  })

  it('T. no Edit/Delete controls exist on handled samples', async () => {
    const delivered = buildFixtureSamplePosition({
      id: 'SP-HANDLED',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: createDeliveredDelivery(
        (() => {
          const result = parseDeliveryDestinationCode('LAB-A')
          if (!result.ok) throw new Error('invalid test fixture')
          return result.value
        })(),
      ),
    })
    renderPage({ store: new FakeSampleHandlingStore(ok([]), ok([delivered])) })

    await screen.findByText('No samples to handle yet. Samples appear automatically once a sampling rit is recorded on a Pile.')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
