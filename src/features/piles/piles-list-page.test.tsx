import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import type { ActivatedPile } from '@/application/pile-master/activate-new-pile'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { ShiftId } from '@/domain/common/identifiers'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parsePileId, parseShiftId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createPile, type Pile } from '@/domain/pile/pile'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId } from '@/domain/fleet/front'
import { parseHaulerCode } from '@/domain/master/master-codes'
import { createHaulerReference } from '@/domain/master/references'
import { parseFleetId } from '@/domain/common/identifiers'
import { createShift } from '@/domain/shift/shift'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import i18n from '@/i18n'
import { PilesListPage, type PilesListPageStore } from './piles-list-page'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

class FakeAddPileStore implements PilesListPageStore {
  readonly calls: Array<{ shiftId: ShiftId; pile: Pile }> = []
  private readonly impl: (shiftId: ShiftId, pile: Pile) => Promise<Result<void, DomainError>>

  constructor(impl: (shiftId: ShiftId, pile: Pile) => Promise<Result<void, DomainError>> = async () => ok(undefined)) {
    this.impl = impl
  }

  async addPileToWorkspace(shiftId: ShiftId, pile: Pile): Promise<Result<void, DomainError>> {
    this.calls.push({ shiftId, pile })
    return this.impl(shiftId, pile)
  }
}

function buildMasterData(): MasterData {
  const br1 = must(parseSectorCode('BR1'))
  const other = must(parseSectorCode('OTHER'))
  const sap = must(parseOreCode('SAP'))
  const lim = must(parseOreCode('LIM'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(br1), createSectorReference(other)],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(br1, must(parsePileAreaCode('STOCK-1')), must(parsePileId('PILE-1')), sap),
        createPileAreaReference(br1, must(parsePileAreaCode('STOCK-1')), must(parsePileId('PILE-2')), lim),
        createPileAreaReference(other, must(parsePileAreaCode('STOCK-2')), must(parsePileId('PILE-9')), sap),
      ],
      haulers: [createHaulerReference(must(parseHaulerCode('H1')))],
      trucks: [],
      oreSamplingConfigs: [sap, lim].map((oreCode) =>
        createOreSamplingConfig({
          oreCode,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ),
    }),
  )
}

function buildWorkspace(activePiles: readonly Pile[] = [], fleetSetupOverride?: FleetSetup): LocalShiftWorkspace {
  const masterData = buildMasterData()
  const fleetSetup = fleetSetupOverride ?? must(createFleetSetup({ fronts: [], fleets: [] }, masterData))
  const shift = createShift({
    id: must(parseShiftId('shift-1')),
    date: must(parseShiftDate('2026-09-04')),
    shiftCode: must(parseShiftCode('DS')),
    sectorCode: must(parseSectorCode('BR1')),
    samplingHouseCode: must(parseSamplingHouseCode('SH_01')),
    status: 'NEW',
  })
  return {
    shiftId: shift.id,
    shift,
    piles: activePiles,
    masterData,
    fleetSetup,
    pendingBatches: [],
    pendingSamples: [],
    manpower: [],
  }
}

function renderPage(
  workspace: LocalShiftWorkspace,
  store: PilesListPageStore,
  onPileAdded = vi.fn(),
  createNewPile?: (draft: NewPileDraft) => Promise<Result<ActivatedPile, DomainError>>,
) {
  return {
    onPileAdded,
    ...render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PilesListPage
            workspace={workspace}
            store={store}
            onPileAdded={onPileAdded}
            createNewPile={createNewPile}
          />
        </MemoryRouter>
      </I18nextProvider>,
    ),
  }
}

describe('PilesListPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('A. a fresh shift (no active piles) shows the empty state and an Add Pile action', () => {
    renderPage(buildWorkspace([]), new FakeAddPileStore())

    expect(screen.getByText('No active piles for this shift yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Pile' })).toBeInTheDocument()
  })

  it('B. shows only workspace.piles, never every master pile area', () => {
    const activePile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    renderPage(buildWorkspace([activePile]), new FakeAddPileStore())

    expect(screen.getByText('PILE-1')).toBeInTheDocument()
    expect(screen.queryByText('PILE-2')).not.toBeInTheDocument()
    expect(screen.queryByText('PILE-9')).not.toBeInTheDocument()
  })

  it('C. search results are filtered to the Shift Sector and exclude already-active piles, never a giant native select', async () => {
    const user = userEvent.setup()
    const activePile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    renderPage(buildWorkspace([activePile]), new FakeAddPileStore())

    await user.click(screen.getByRole('button', { name: '+ Add Pile' }))
    const searchInput = screen.getByLabelText('Search Pile_ID / Stockpile_Code')
    expect(searchInput.tagName).toBe('INPUT')

    await user.type(searchInput, 'PILE')

    // PILE-1 (already active) and PILE-9 (a different Sector) must not appear.
    expect(screen.getByRole('button', { name: /PILE-2/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /PILE-1/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /PILE-9/ })).not.toBeInTheDocument()
  })

  it('D. selecting a search result derives its Ore from master data (never typed manually) and persists via the store', async () => {
    const user = userEvent.setup()
    const store = new FakeAddPileStore()
    const { onPileAdded } = renderPage(buildWorkspace([]), store)

    await user.click(screen.getByRole('button', { name: '+ Add Pile' }))
    await user.type(screen.getByLabelText('Search Pile_ID / Stockpile_Code'), 'PILE-2')
    await user.click(await screen.findByRole('button', { name: /PILE-2/ }))

    expect(store.calls).toHaveLength(1)
    expect(store.calls[0].pile.id).toBe('PILE-2')
    expect(store.calls[0].pile.oreCode).toBe('LIM')
    expect(onPileAdded).toHaveBeenCalledTimes(1)
  })

  it('E. a duplicate active pile is rejected with a translated error, never a raw store message', async () => {
    const user = userEvent.setup()
    const store = new FakeAddPileStore(async () =>
      err({ code: 'DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE', message: 'Duplicate PileId in shift workspace: PILE-2' }),
    )
    const { onPileAdded } = renderPage(buildWorkspace([]), store)

    await user.click(screen.getByRole('button', { name: '+ Add Pile' }))
    await user.type(screen.getByLabelText('Search Pile_ID / Stockpile_Code'), 'PILE-2')
    await user.click(await screen.findByRole('button', { name: /PILE-2/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This Pile is already active in this shift.')
    expect(screen.queryByText(/Duplicate PileId in shift workspace/)).not.toBeInTheDocument()
    expect(onPileAdded).not.toHaveBeenCalled()
  })

  it('F. a search that matches no existing master pile shows "no pile found" when New Pile Master creation is not wired', async () => {
    const activePile1 = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    const activePile2 = createPile(must(parsePileId('PILE-2')), must(parseOreCode('LIM')))
    const user = userEvent.setup()
    renderPage(buildWorkspace([activePile1, activePile2]), new FakeAddPileStore())

    await user.click(screen.getByRole('button', { name: '+ Add Pile' }))
    await user.type(screen.getByLabelText('Search Pile_ID / Stockpile_Code'), 'PILE')

    expect(screen.getByText('No pile found.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add New Pile/ })).not.toBeInTheDocument()
  })

  it('G. a search that matches nothing offers New Pile Master creation when wired, and activates it on success', async () => {
    const user = userEvent.setup()
    const store = new FakeAddPileStore()
    const createNewPile = vi.fn(async (draft: NewPileDraft): Promise<Result<ActivatedPile, DomainError>> =>
      ok({
        pile: createPile(must(parsePileId(draft.pileId)), must(parseOreCode('SAP'))),
        pileArea: createPileAreaReference(
          must(parseSectorCode('BR1')),
          must(parsePileAreaCode('LS_18')),
          must(parsePileId(draft.pileId)),
          must(parseOreCode('SAP')),
        ),
      }),
    )
    const { onPileAdded } = renderPage(buildWorkspace([]), store, vi.fn(), createNewPile)

    await user.click(screen.getByRole('button', { name: '+ Add Pile' }))
    await user.type(screen.getByLabelText('Search Pile_ID / Stockpile_Code'), 'L18_S99')
    await user.click(screen.getByRole('button', { name: '+ Add New Pile "L18_S99"' }))

    expect(await screen.findByText('L18_S99')).toBeInTheDocument()
    expect(screen.getByText('BR1')).toBeInTheDocument()
    expect(screen.getByText('LS_18')).toBeInTheDocument()
    expect(screen.getByText('SAP')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(createNewPile).toHaveBeenCalledWith({ pileId: 'L18_S99' })
    expect(onPileAdded).toHaveBeenCalledTimes(1)
  })

  it('H. shows every ACTIVE Front whose Destination matches this Pile, each linking to Production > Record for this Pile (Phase 2 retires the /piles haulage checker)', () => {
    const hauler = must(parseHaulerCode('H1'))
    const sector = must(parseSectorCode('BR1'))
    const front1 = createFrontDefinition(must(createFrontId(sector, 3)), sector, hauler, must(parsePileId('PILE-1')))
    const front2 = createFrontDefinition(must(createFrontId(sector, 5)), sector, hauler, must(parsePileId('PILE-1')))
    const fleet1 = must(createBaseFleetDefinition({ fleetId: must(parseFleetId('FLEET-1')), frontId: front1.frontId, truckIds: [] }))
    const fleet2 = must(createBaseFleetDefinition({ fleetId: must(parseFleetId('FLEET-2')), frontId: front2.frontId, truckIds: [] }))
    const masterData = buildMasterData()
    const fleetSetup = must(createFleetSetup({ fronts: [front1, front2], fleets: [fleet1, fleet2] }, masterData))
    const activePile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))

    renderPage(buildWorkspace([activePile], fleetSetup), new FakeAddPileStore())

    const chip1 = screen.getByRole('link', { name: 'BR1/03' })
    const chip2 = screen.getByRole('link', { name: 'BR1/05' })
    expect(chip1).toHaveAttribute('href', '/production/record/PILE-1')
    expect(chip2).toHaveAttribute('href', '/production/record/PILE-1')
  })

  it('I. a HISTORICAL Front (superseded by a continuation) is never offered on the Pile list', () => {
    const hauler = must(parseHaulerCode('H1'))
    const sector = must(parseSectorCode('BR1'))
    const front1 = createFrontDefinition(must(createFrontId(sector, 1)), sector, hauler, must(parsePileId('PILE-1')))
    const front2 = createFrontDefinition(must(createFrontId(sector, 2)), sector, hauler, must(parsePileId('PILE-1')))
    const fleet1 = must(createBaseFleetDefinition({ fleetId: must(parseFleetId('FLEET-1')), frontId: front1.frontId, truckIds: [] }))
    const fleet2 = must(
      createDerivedFleetDefinition({
        fleetId: must(parseFleetId('FLEET-2')),
        frontId: front2.frontId,
        referenceFleetId: fleet1.fleetId,
        addedTruckIds: [],
        removedTruckIds: [],
      }),
    )
    const masterData = buildMasterData()
    const fleetSetup = must(createFleetSetup({ fronts: [front1, front2], fleets: [fleet1, fleet2] }, masterData))
    const activePile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))

    renderPage(buildWorkspace([activePile], fleetSetup), new FakeAddPileStore())

    expect(screen.queryByRole('link', { name: 'BR1/01' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'BR1/02' })).toBeInTheDocument()
  })

  it('J. a Pile with no active Front shows a translated empty note instead of a chip', () => {
    const activePile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    renderPage(buildWorkspace([activePile]), new FakeAddPileStore())

    expect(screen.getByText('No active Front for this Pile.')).toBeInTheDocument()
  })
})
