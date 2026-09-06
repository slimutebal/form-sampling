import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HaulageStoreError, HaulageTransactionStore } from '@/application/haulage-operation/haulage-transaction-store'
import { operationalFleetOptionForFront, type OperationalFleetOption } from '@/application/haulage-operation/operational-fleet-options'
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
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
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

/** A second Front/Fleet (F2 / FLEET-B, truck T2) sharing the same fixture MasterData, for Truck-checker ranking tests. */
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

/** Resolves the operational Front option for `frontId` against `fleetSetupToUse`/`pileToUse` — reuses the same resolver `PileDetailPage` uses, so fixtures never hand-construct a shape production code would reject. */
function buildFrontOption(fleetSetupToUse: FleetSetup, pileToUse: Pile, frontId: string): OperationalFleetOption {
  const result = operationalFleetOptionForFront(masterData, fleetSetupToUse, pileToUse.id, frontId)
  if (!result.ok) throw new Error(`invalid test fixture: ${result.error.code}`)
  return result.value
}

function renderPage(overrides: Partial<PileHaulagePageProps> & { store: HaulageTransactionStore }) {
  const effectiveFleetSetup = overrides.fleetSetup ?? fleetSetup
  const effectivePile = overrides.pile ?? pile
  const props: PileHaulagePageProps = {
    shift,
    pile,
    masterData,
    fleetSetup,
    frontOption: buildFrontOption(effectiveFleetSetup, effectivePile, FIXTURE_FRONT_ID),
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

  it('B. load success shows Pile, Ore, Batch, Next Rit, Sample, Front (read-only), Truck, and Record', async () => {
    renderPage({ store: new FakeHaulageTransactionStore(ok([])) })

    expect(await screen.findByText(fixturePileId('PILE-1'))).toBeInTheDocument()
    expect(screen.getByText(/SAP/)).toBeInTheDocument()
    expect(screen.getByText('1', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('1 / 20')).toBeInTheDocument()
    expect(screen.getByText('No Sample')).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_FRONT_ID)).toBeInTheDocument()
    // Front is read-only context (Phase 18 §5) — never a selectable control.
    expect(screen.queryByLabelText('Front')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Truck')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Haulage' })).toBeInTheDocument()
  })

  it('C. a load error shows a translated message with Retry, never a silent empty state', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' })),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load haulage data for this Pile.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(FIXTURE_FRONT_ID)).not.toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
  })

  // Front resolution (existence/ACTIVE/destination-match) now happens once,
  // upstream in `operationalFleetOptionForFront` — covered by
  // `operational-fleet-options.test.ts` — before this page ever renders.
  // There is no in-page Front dropdown left to resolve options into.

  it('D. the Truck checker ranks this Front\'s effective-fleet trucks as quick-select chips, and search still reaches a Truck outside it', async () => {
    const user = userEvent.setup()
    const twoFrontFleetSetup = buildTwoFrontFleetSetup()
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      fleetSetup: twoFrontFleetSetup,
      frontOption: buildFrontOption(twoFrontFleetSetup, pile, FIXTURE_FRONT_ID),
    })

    await screen.findByText(FIXTURE_FRONT_ID)
    expect(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'T2' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Truck'), 'T2')
    expect(await screen.findByRole('button', { name: 'T2' })).toBeInTheDocument()
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

    await screen.findByText(FIXTURE_FRONT_ID)
    await user.click(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    await user.click(screen.getByRole('button', { name: 'Record Haulage' }))

    expect(await screen.findByText('Rit 1 recorded')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    expect(screen.getByText('2 / 20')).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_FRONT_ID)).toBeInTheDocument()
    // Truck cleared on success (§25) — the quick-select chip reappears.
    expect(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID })).toBeInTheDocument()
  })

  it('records a WRONG_TRUCK transaction instead of blocking it (Phase 18 §6): searching outside the effective fleet stays recordable', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]))
    renderPage({ store })

    await screen.findByText(FIXTURE_FRONT_ID)
    await user.type(screen.getByLabelText('Truck'), FIXTURE_WRONG_TRUCK_TRUCK_ID)
    await user.click(await screen.findByRole('button', { name: FIXTURE_WRONG_TRUCK_TRUCK_ID }))
    await user.click(screen.getByRole('button', { name: 'Record Haulage' }))

    expect(await screen.findByText('Rit 1 recorded')).toBeInTheDocument()
    expect(store.addCalls).toHaveLength(1)
    expect(store.addCalls[0]?.truckValidation.status).toBe('WRONG_TRUCK')
  })

  it('J. a save failure keeps progress unchanged, shows a translated error, and does not append the transaction', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]), async () =>
      err({ code: 'DUPLICATE_HAULAGE_TRANSACTION_ID', message: 'raw diagnostic' }),
    )
    renderPage({ store })

    await screen.findByText(FIXTURE_FRONT_ID)
    await user.click(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
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

    await screen.findByText(FIXTURE_FRONT_ID)
    await user.click(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    const button = screen.getByRole('button', { name: 'Record Haulage' })
    await user.click(button)

    expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Recording…' }))
    expect(store.addCalls).toHaveLength(1)

    resolveAdd(ok(undefined))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Recording…' })).not.toBeInTheDocument()
    })
    // The write finished and Truck was cleared on success (§25) — the
    // quick-select chip is back, so the Record button is disabled again
    // for a different reason (no Truck selected), not a pending write.
    expect(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID })).toBeInTheDocument()
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

    await screen.findByLabelText('Truck')
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

  it('shows the compact BATCH / RIT BERIKUTNYA / SAMPEL row and updates the Sample count after a sample-rit record', async () => {
    const user = userEvent.setup()
    const store = new FakeHaulageTransactionStore(ok([]))
    renderPage({ store, expectedPositions: [fixturePosition(1, 2), fixturePosition(1, 3)] })

    await screen.findByText(FIXTURE_FRONT_ID)
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByText('0 / 10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    await user.click(screen.getByRole('button', { name: 'Record Sample Haulage' }))

    await screen.findByText('Rit 2 recorded')
    expect(screen.getByText('1 / 10')).toBeInTheDocument()
  })

  it('shows TERSAMPEL for a recorded sample position and TERCATAT for a non-sample one', async () => {
    const recorded = [
      buildFixtureHaulageTransaction({ id: 'TX-A', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'TX-B', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
    ]
    renderPage({
      store: new FakeHaulageTransactionStore(ok(recorded)),
      expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2), fixturePosition(1, 3)],
    })

    expect(await screen.findByText('Recorded Positions')).toBeInTheDocument()
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(screen.getByText('Sampled')).toBeInTheDocument()
  })
})

describe('PileHaulagePage — fresh pile initial position (post-inspection correction §6)', () => {
  it('shows the Initial Position form, prefilled 001/001, for a fresh pile with an empty plan', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [],
      freshPileEligible: true,
    })

    expect(await screen.findByRole('heading', { name: 'Initial Position' })).toBeInTheDocument()
    expect(screen.getByLabelText('Batch Awal')).toHaveValue('001')
    expect(screen.getByLabelText('Rit Awal')).toHaveValue('001')
    expect(screen.queryByLabelText('Truck')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'The starting batch for this new Pile has not been confirmed yet. Contact your supervisor before recording haulage.',
      ),
    ).not.toBeInTheDocument()
  })

  it('never shows the Initial Position form when the pile is not eligible (handover/continuation carry-over exists)', async () => {
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [],
      freshPileEligible: false,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The starting batch for this new Pile has not been confirmed yet.',
    )
    expect(screen.queryByRole('heading', { name: 'Initial Position' })).not.toBeInTheDocument()
  })

  it('confirming a Batch/Rit override calls onConfirmFreshPileStartPosition with the parsed values', async () => {
    const user = userEvent.setup()
    const onConfirmFreshPileStartPosition = async () => ok(undefined)
    let capturedBatch: number | undefined
    let capturedRit: number | undefined
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [],
      freshPileEligible: true,
      onConfirmFreshPileStartPosition: async (startPosition) => {
        capturedBatch = Number(startPosition.batchNumber)
        capturedRit = Number(startPosition.ritNumber)
        return onConfirmFreshPileStartPosition()
      },
    })

    await screen.findByRole('heading', { name: 'Initial Position' })
    await user.clear(screen.getByLabelText('Batch Awal'))
    await user.type(screen.getByLabelText('Batch Awal'), '25')
    await user.clear(screen.getByLabelText('Rit Awal'))
    await user.type(screen.getByLabelText('Rit Awal'), '11')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(capturedBatch).toBe(25)
      expect(capturedRit).toBe(11)
    })
  })

  it('shows a translated error and does not clear the form when confirmation fails', async () => {
    const user = userEvent.setup()
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [],
      freshPileEligible: true,
      onConfirmFreshPileStartPosition: async () =>
        err({ code: 'APPS_SCRIPT_UNAVAILABLE', message: 'raw diagnostic detail' }),
    })

    await screen.findByRole('heading', { name: 'Initial Position' })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/raw diagnostic detail/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Initial Position' })).toBeInTheDocument()
  })

  it('offers "Change Starting Position" after confirmation while no haulage is recorded yet, and can toggle back', async () => {
    const user = userEvent.setup()
    renderPage({
      store: new FakeHaulageTransactionStore(ok([])),
      expectedPositions: [fixturePosition(1, 1), fixturePosition(1, 2)],
      freshPileEligible: true,
      pile: { ...pile, freshPileStartPosition: { batchNumber: 1 as never, ritNumber: 1 as never } },
      onConfirmFreshPileStartPosition: async () => ok(undefined),
    })

    expect(await screen.findByLabelText('Truck')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Initial Position' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change Starting Position' }))
    expect(screen.getByRole('heading', { name: 'Initial Position' })).toBeInTheDocument()
    expect(screen.getByLabelText('Batch Awal')).toHaveValue('001')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByLabelText('Truck')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Initial Position' })).not.toBeInTheDocument()
  })

  it('never offers "Change Starting Position" once haulage has been recorded for this pile', async () => {
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
      freshPileEligible: true,
      pile: { ...pile, freshPileStartPosition: { batchNumber: 1 as never, ritNumber: 1 as never } },
      onConfirmFreshPileStartPosition: async () => ok(undefined),
    })

    await screen.findByLabelText('Truck')
    expect(screen.queryByRole('button', { name: 'Change Starting Position' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Initial Position' })).not.toBeInTheDocument()
  })
})
