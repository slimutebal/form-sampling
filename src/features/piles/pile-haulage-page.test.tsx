import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HaulageStoreError, HaulageTransactionStore } from '@/application/haulage-operation/haulage-transaction-store'
import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createBaseFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition } from '@/domain/fleet/front'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { Shift } from '@/domain/shift/shift'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_FLEET_ID,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  fixtureFleetId,
  fixtureFrontId,
  fixturePileId,
  fixturePosition,
  fixtureTruckId,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { PileHaulagePage, type PileHaulagePageProps } from '@/features/piles/pile-haulage-page'

type ListResult = Result<readonly HaulageTransaction[], HaulageStoreError>
type AddResult = Result<void, HaulageStoreError>

class FakeHaulageTransactionStore implements HaulageTransactionStore {
  readonly addCalls: HaulageTransaction[] = []
  private readonly listResult: ListResult | Promise<ListResult>
  private readonly addImpl: (transaction: HaulageTransaction) => Promise<AddResult>

  constructor(
    listResult: ListResult | Promise<ListResult>,
    addImpl: (transaction: HaulageTransaction) => Promise<AddResult> = async () => ok(undefined),
  ) {
    this.listResult = listResult
    this.addImpl = addImpl
  }

  async listHaulageTransactionsForShiftPile(): Promise<ListResult> {
    return this.listResult
  }

  async addHaulageTransaction(transaction: HaulageTransaction): Promise<AddResult> {
    this.addCalls.push(transaction)
    return this.addImpl(transaction)
  }
}

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

const masterData: MasterData = buildFixtureMasterData()
const fleetSetup: FleetSetup = buildFixtureFleetSetup(masterData)
const pile: Pile = buildFixtureSapPile('PILE-1')
const shift: Shift = buildFixtureShift('SHIFT-1')

/** A second Front/Fleet (F2 / FLEET-B, truck T2) sharing the same fixture MasterData, for Front/Truck filtering tests. */
function buildTwoFrontFleetSetup(): FleetSetup {
  const front1 = createFrontDefinition(
    fixtureFrontId(FIXTURE_FRONT_ID),
    masterData.sectors[0]!.code,
    masterData.haulers[0]!.code,
  )
  const front2 = createFrontDefinition(fixtureFrontId('F2'), masterData.sectors[0]!.code, masterData.haulers[0]!.code)
  const fleet1 = createBaseFleetDefinition({
    fleetId: fixtureFleetId(FIXTURE_FLEET_ID),
    frontId: fixtureFrontId(FIXTURE_FRONT_ID),
    truckIds: [fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID)],
  })
  const fleet2 = createBaseFleetDefinition({
    fleetId: fixtureFleetId('FLEET-B'),
    frontId: fixtureFrontId('F2'),
    truckIds: [fixtureTruckId('T2')],
  })
  if (!fleet1.ok || !fleet2.ok) throw new Error('invalid test fixture')
  const setup = createFleetSetup({ fronts: [front1, front2], fleets: [fleet1.value, fleet2.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

/** Same Front/Fleet id as the default fixture, but T1 has been removed from FLEET-A's membership — simulates a Fleet setup edit that leaves a previously-valid selection stale. */
function buildFleetSetupWithoutTruckMembership(): FleetSetup {
  const front = createFrontDefinition(
    fixtureFrontId(FIXTURE_FRONT_ID),
    masterData.sectors[0]!.code,
    masterData.haulers[0]!.code,
  )
  const fleet = createBaseFleetDefinition({
    fleetId: fixtureFleetId(FIXTURE_FLEET_ID),
    frontId: fixtureFrontId(FIXTURE_FRONT_ID),
    truckIds: [],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')
  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

function renderPage(overrides: Partial<PileHaulagePageProps> & { store: HaulageTransactionStore }) {
  const props: PileHaulagePageProps = {
    shift,
    pile,
    masterData,
    fleetSetup,
    expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2)],
    generateTransactionId: () => 'TX-FIXED',
    ...overrides,
  }
  return render(<PileHaulagePage {...props} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PileHaulagePage', () => {
  it('A. shows a loading state before the transaction read resolves', () => {
    renderPage({ store: new FakeHaulageTransactionStore(neverResolves()) })
    expect(screen.getByText('Loading haulage…')).toBeInTheDocument()
  })

  it('B. load success shows Pile, Ore, Batch, Next Rit, Sample status, Front, Truck, and Record', async () => {
    renderPage({ store: new FakeHaulageTransactionStore(ok([])) })

    expect(await screen.findByText(fixturePileId('PILE-1'))).toBeInTheDocument()
    expect(screen.getByText(/SAP/)).toBeInTheDocument()
    expect(screen.getByText('1', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('1 / 20')).toBeInTheDocument()
    expect(screen.getByText('No Sample')).toBeInTheDocument()
    expect(screen.getByLabelText('Front')).toBeInTheDocument()
    expect(screen.getByLabelText('Truck')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Haulage' })).toBeInTheDocument()
  })

  it('C. a load error shows a translated message with Retry, never a silent empty state', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' })),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load haulage data for this Pile.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Front')).not.toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
  })

  it('D. Front options come from the resolved Fleet setup', async () => {
    renderPage({ store: new FakeHaulageTransactionStore(ok([])) })
    const front = await screen.findByLabelText('Front')
    expect(within(front).getByRole('option', { name: FIXTURE_FRONT_ID })).toBeInTheDocument()
  })

  it('E. selecting a Front only exposes that effective Fleet\'s trucks', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeHaulageTransactionStore(ok([])), fleetSetup: buildTwoFrontFleetSetup() })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    const truck = screen.getByLabelText('Truck')
    expect(within(truck).getByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID })).toBeInTheDocument()
    expect(within(truck).queryByRole('option', { name: 'T2' })).not.toBeInTheDocument()

    await user.selectOptions(front, 'F2')
    expect(within(truck).getByRole('option', { name: 'T2' })).toBeInTheDocument()
    expect(within(truck).queryByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID })).not.toBeInTheDocument()
  })

  it('F. changing Front clears the selected Truck', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeHaulageTransactionStore(ok([])), fleetSetup: buildTwoFrontFleetSetup() })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    const truck = screen.getByLabelText('Truck')
    await user.selectOptions(truck, FIXTURE_IN_FLEET_TRUCK_ID)
    expect(truck).toHaveValue(FIXTURE_IN_FLEET_TRUCK_ID)

    await user.selectOptions(front, 'F2')
    expect(truck).toHaveValue('')
  })

  it('G. a sample rit prominently shows Sample Required with its increment', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [fixturePosition(1, 2)],
    })
    expect(await screen.findByText('Sample Required')).toBeInTheDocument()
    expect(screen.getByText(/Increment/)).toHaveTextContent('Increment 01')
  })

  it('H. a non-sample rit shows No Sample', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [fixturePosition(1, 1)],
    })
    expect(await screen.findByText('No Sample')).toBeInTheDocument()
  })

  it('I. a successful record advances progress, shows feedback, retains Front, and clears Truck', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]))
    renderPage({ store })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    await user.selectOptions(screen.getByLabelText('Truck'), FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(screen.getByRole('button', { name: 'Record Haulage' }))

    expect(await screen.findByText('Rit 1 recorded')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    expect(screen.getByText('2 / 20')).toBeInTheDocument()
    expect(screen.getByLabelText('Front')).toHaveValue(FIXTURE_FLEET_ID)
    expect(screen.getByLabelText('Truck')).toHaveValue('')
  })

  it('J. a save failure keeps progress unchanged, shows a translated error, and does not append the transaction', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]), async () =>
      err({ code: 'DUPLICATE_HAULAGE_TRANSACTION_ID', message: 'raw diagnostic' }),
    )
    renderPage({ store })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    await user.selectOptions(screen.getByLabelText('Truck'), FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(screen.getByRole('button', { name: 'Record Haulage' }))

    expect(await screen.findByText('This haulage entry was already recorded.')).toBeInTheDocument()
    expect(screen.getByText('1 / 20')).toBeInTheDocument()
    expect(screen.queryByText(/raw diagnostic/)).not.toBeInTheDocument()
  })

  it('K. the Record button disables while a write is pending and only one write is issued', async () => {
    const user = userEvent.setup()
    let resolveAdd: (result: AddResult) => void = () => {}
    const pending = new Promise<AddResult>((resolve) => {
      resolveAdd = resolve
    })
    const store = new FakeHaulageTransactionStore(ok([]), async () => pending)
    renderPage({ store })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    await user.selectOptions(screen.getByLabelText('Truck'), FIXTURE_IN_FLEET_TRUCK_ID)
    const button = screen.getByRole('button', { name: 'Record Haulage' })
    await user.click(button)

    expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Recording…' }))
    expect(store.addCalls).toHaveLength(1)

    resolveAdd(ok(undefined))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Recording…' })).not.toBeInTheDocument()
    })
    // The write finished and Truck was cleared on success (§25), so the
    // button is disabled again for a different reason — no Truck
    // selected — not because a write is still pending.
    expect(screen.getByLabelText('Truck')).toHaveValue('')
  })

  it('L. an internal gap shows a translated Skipped exception', async () => {
    const recorded = [
      buildFixtureHaulageTransaction({
        id: 'TX-A',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 1,
        masterData,
        fleetSetup,
      }),
      buildFixtureHaulageTransaction({
        id: 'TX-B',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 3,
        masterData,
        fleetSetup,
      }),
    ]
    renderPage({
      store: new FakeHaulageTransactionStore(ok(recorded)),
      expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2), fixturePosition(1, 3), fixturePosition(1, 4)],
    })

    expect(await screen.findByText('Skipped Positions')).toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('M. an unrecorded tail with no later record shows no false Skipped warning', async () => {
    const recorded = [
      buildFixtureHaulageTransaction({
        id: 'TX-A',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 1,
        masterData,
        fleetSetup,
      }),
    ]
    renderPage({
      store: new FakeHaulageTransactionStore(ok(recorded)),
      expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2)],
    })

    await screen.findByLabelText('Front')
    expect(screen.queryByText('Skipped Positions')).not.toBeInTheDocument()
  })

  it('N. an exhausted plan shows no record controls and a neutral message, never "Complete"', async () => {
    const recorded = [
      buildFixtureHaulageTransaction({
        id: 'TX-A',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 1,
        masterData,
        fleetSetup,
      }),
      buildFixtureHaulageTransaction({
        id: 'TX-B',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 2,
        masterData,
        fleetSetup,
      }),
    ]
    renderPage({
      store: new FakeHaulageTransactionStore(ok(recorded)),
      expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2)],
    })

    expect(await screen.findByText('No remaining planned haulage positions.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Haulage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Sample Haulage' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Complete/)).not.toBeInTheDocument()
  })

  it('O. never displays a raw DomainError or LocalDatabaseError message', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(err({ code: 'SHIFT_WORKSPACE_NOT_FOUND', message: 'diagnostic detail' })),
    })
    await screen.findByRole('alert')
    expect(screen.queryByText(/diagnostic detail/)).not.toBeInTheDocument()
  })

  it('R. a stale Front/Truck selection after the Fleet setup changes is rejected defensively, never reaching id generation or a write', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]))
    let generateCalls = 0
    const generateTransactionId = () => {
      generateCalls += 1
      return 'TX-SHOULD-NOT-BE-GENERATED'
    }

    const { rerender } = renderPage({ store, generateTransactionId })

    const front = await screen.findByLabelText('Front')
    await user.selectOptions(front, FIXTURE_FRONT_ID)
    await user.selectOptions(screen.getByLabelText('Truck'), FIXTURE_IN_FLEET_TRUCK_ID)
    expect(screen.getByRole('button', { name: 'Record Haulage' })).toBeEnabled()

    // Simulate a Fleet setup change arriving as a new prop (e.g. Fleet
    // Setup was edited elsewhere in the app) while the page's own
    // Front/Truck selection state is untouched and still holds the
    // now-stale ids.
    rerender(
      <PileHaulagePage
        shift={shift}
        pile={pile}
        masterData={masterData}
        fleetSetup={buildFleetSetupWithoutTruckMembership()}
        expectedPositions={[fixturePosition(1, 1), fixturePosition(1, 2)]}
        store={store}
        generateTransactionId={generateTransactionId}
      />,
    )

    const recordButton = screen.getByRole('button', { name: 'Record Haulage' })
    expect(recordButton).toBeDisabled()

    // Clicking a disabled button fires no submit — this proves the guard
    // holds even when the UI is driven directly, not merely that a
    // human would be prevented from clicking it.
    await user.click(recordButton)

    expect(generateCalls).toBe(0)
    expect(store.addCalls).toHaveLength(0)
    // Progress must not have advanced.
    expect(screen.getByText('1 / 20')).toBeInTheDocument()
  })
})
