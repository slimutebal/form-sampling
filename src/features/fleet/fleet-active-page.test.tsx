import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok, type DomainError, type Result } from '@/domain/common/result'
import type { ShiftId } from '@/domain/common/identifiers'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseFleetId, parsePileId, parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId } from '@/domain/fleet/front'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createPileAreaReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import type { Pile } from '@/domain/pile/pile'
import { createShift, type Shift } from '@/domain/shift/shift'
import { FleetActivePage, type FleetActivePageStore } from '@/features/fleet/fleet-active-page'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import i18n from '@/i18n'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

const SECTOR = 'S1'
const HAULER = 'H1'
const HAULER_2 = 'STM'

function buildMasterData(): MasterData {
  const sector = value(parseSectorCode(SECTOR))
  const hauler = value(parseHaulerCode(HAULER))
  const hauler2 = value(parseHaulerCode(HAULER_2))
  const ore = value(parseOreCode('SAP'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(sector, value(parsePileAreaCode('STK-1')), value(parsePileId('PILE-1')), ore),
        createPileAreaReference(sector, value(parsePileAreaCode('S27')), value(parsePileId('L9_27')), ore),
      ],
      haulers: [createHaulerReference(hauler), createHaulerReference(hauler2)],
      trucks: [
        createTruckReference(value(parseTruckId('T1')), hauler),
        createTruckReference(value(parseTruckId('T2')), hauler),
        createTruckReference(value(parseTruckId('STM-A40_0001')), hauler2),
      ],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: ore,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function buildShift(): Shift {
  return createShift({
    id: value(parseShiftId('SHIFT-1')),
    date: value(parseShiftDate('2026-09-04')),
    shiftCode: value(parseShiftCode('D')),
    sectorCode: value(parseSectorCode(SECTOR)),
    samplingHouseCode: value(parseSamplingHouseCode('SH1')),
    status: 'ACTIVE',
  })
}

function buildSingleFrontFleetSetup(masterData: MasterData): FleetSetup {
  const sector = value(parseSectorCode(SECTOR))
  const hauler = value(parseHaulerCode(HAULER))
  const front = createFrontDefinition(value(createFrontId(sector, 1)), sector, hauler, value(parsePileId('PILE-1')))
  const fleet = value(
    createBaseFleetDefinition({ fleetId: value(parseFleetId('FLEET-01')), frontId: front.frontId, truckIds: [value(parseTruckId('T1'))] }),
  )
  return value(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

function buildContinuedFleetSetup(masterData: MasterData): FleetSetup {
  const sector = value(parseSectorCode(SECTOR))
  const hauler = value(parseHaulerCode(HAULER))
  const front1 = createFrontDefinition(value(createFrontId(sector, 1)), sector, hauler, value(parsePileId('PILE-1')))
  const front2 = createFrontDefinition(value(createFrontId(sector, 2)), sector, hauler, value(parsePileId('PILE-1')))
  const fleet1 = value(createBaseFleetDefinition({ fleetId: value(parseFleetId('FLEET-01')), frontId: front1.frontId, truckIds: [] }))
  const fleet2 = value(
    createDerivedFleetDefinition({
      fleetId: value(parseFleetId('FLEET-02')),
      frontId: front2.frontId,
      referenceFleetId: fleet1.fleetId,
      addedTruckIds: [],
      removedTruckIds: [],
    }),
  )
  return value(createFleetSetup({ fronts: [front1, front2], fleets: [fleet1, fleet2] }, masterData))
}

function buildWorkspace(fleetSetup: FleetSetup, masterData: MasterData, piles: readonly Pile[] = []): LocalShiftWorkspace {
  const shift = buildShift()
  return {
    shiftId: shift.id,
    shift,
    piles,
    masterData,
    fleetSetup,
    pendingBatches: [],
    pendingSamples: [],
    manpower: [],
  }
}

function fakeStore(result: Result<void, DomainError> = ok(undefined)): FleetActivePageStore & { appendFrontContinuation: ReturnType<typeof vi.fn> } {
  return {
    appendFrontContinuation: vi.fn(async () => result),
  }
}

describe('FleetActivePage', () => {
  it('lists ACTIVE fronts with their resolved unit count', async () => {
    await i18n.changeLanguage('en')
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)

    render(<FleetActivePage workspace={workspace} store={fakeStore()} onFleetUpdated={vi.fn()} />)

    expect(screen.getByText('S1/01')).toBeInTheDocument()
    const unitsRow = screen.getByText('Units').closest('div')
    expect(unitsRow ? within(unitsRow).getByText('1') : null).toBeInTheDocument()
  })

  it('excludes a HISTORICAL front from the active list and shows it under history with its successor', async () => {
    await i18n.changeLanguage('en')
    const masterData = buildMasterData()
    const fleetSetup = buildContinuedFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)

    render(<FleetActivePage workspace={workspace} store={fakeStore()} onFleetUpdated={vi.fn()} />)

    // Active section: only S1/02 (S1/01's continuation) has its own dedicated card heading.
    const activeHeadings = screen.getAllByRole('heading', { level: 3 })
    expect(activeHeadings.map((heading) => heading.textContent)).toEqual(['S1/02'])

    expect(screen.getByText('S1/01')).toBeInTheDocument()
    expect(screen.getByText('Continued by S1/02')).toBeInTheDocument()
  })

  it('saves a Front continuation through the store and refreshes the workspace', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)
    const store = fakeStore()
    const onFleetUpdated = vi.fn()

    render(<FleetActivePage workspace={workspace} store={store} onFleetUpdated={onFleetUpdated} generateFleetId={() => 'FLEET-02'} />)

    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    expect(screen.getByText('S1/02')).toBeInTheDocument() // auto-derived new Front No preview

    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    expect(store.appendFrontContinuation).toHaveBeenCalledTimes(1)
    const [, params] = store.appendFrontContinuation.mock.calls[0] as [ShiftId, { fleetSetup: FleetSetup }]
    expect(params.fleetSetup.fronts.map((front) => front.frontId).sort()).toEqual(['S1/01', 'S1/02'])
    expect(onFleetUpdated).toHaveBeenCalledTimes(1)
  })

  it('surfaces a store error instead of silently succeeding', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)
    const store = fakeStore({ ok: false, error: { code: 'SHIFT_WORKSPACE_NOT_FOUND', message: 'x' } })
    const onFleetUpdated = vi.fn()

    render(<FleetActivePage workspace={workspace} store={store} onFleetUpdated={onFleetUpdated} generateFleetId={() => 'FLEET-02'} />)

    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onFleetUpdated).not.toHaveBeenCalled()
  })
})

describe('FleetActivePage — new independent BASE Front (Phase 18 §2, Fleet Reference = "Tidak Ada")', () => {
  it('defaults to BASE mode and stays enabled when there is no active Front to reference yet', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const emptyFleetSetup = value(createFleetSetup({ fronts: [], fleets: [] }, masterData))
    const workspace = buildWorkspace(emptyFleetSetup, masterData)

    render(<FleetActivePage workspace={workspace} store={fakeStore()} onFleetUpdated={vi.fn()} generateFleetId={() => 'FLEET-01'} />)

    expect(screen.getByRole('button', { name: '+ Add Front' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    expect(screen.getByLabelText('Fleet Reference')).toHaveValue('')
    expect(screen.getByLabelText('Hauler')).toBeInTheDocument()
  })

  it('lets the operator pick a Hauler and Trucks from that Hauler when Fleet Reference is "Tidak Ada"', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)

    render(<FleetActivePage workspace={workspace} store={fakeStore()} onFleetUpdated={vi.fn()} generateFleetId={() => 'FLEET-02'} />)

    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), '')
    await user.selectOptions(screen.getByLabelText('Hauler'), HAULER_2)

    const truckSelector = screen.getByLabelText('Add Truck')
    expect(within(truckSelector).getByRole('option', { name: 'STM-A40_0001' })).toBeInTheDocument()
    expect(within(truckSelector).queryByRole('option', { name: 'T1' })).not.toBeInTheDocument()
  })

  it('requires a Destination for a new BASE Front (no reference to inherit one from)', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)

    render(<FleetActivePage workspace={workspace} store={fakeStore()} onFleetUpdated={vi.fn()} generateFleetId={() => 'FLEET-02'} />)

    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), '')
    await user.selectOptions(screen.getByLabelText('Hauler'), HAULER_2)

    expect(screen.getByText('Select a Destination/Pile for this new Front.')).toBeInTheDocument()
  })

  it('saves a new independent BASE Front through the store without retiring the existing active Front', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const masterData = buildMasterData()
    const fleetSetup = buildSingleFrontFleetSetup(masterData)
    const workspace = buildWorkspace(fleetSetup, masterData)
    const store = fakeStore()
    const onFleetUpdated = vi.fn()

    render(<FleetActivePage workspace={workspace} store={store} onFleetUpdated={onFleetUpdated} generateFleetId={() => 'FLEET-02'} />)

    await user.click(screen.getByRole('button', { name: '+ Add Front' }))
    await user.selectOptions(screen.getByLabelText('Fleet Reference'), '')
    await user.selectOptions(screen.getByLabelText('Hauler'), HAULER_2)
    await user.type(screen.getByLabelText('Destination/Pile'), 'L9_27')
    await user.click(await screen.findByRole('button', { name: /L9_27/ }))
    await user.selectOptions(screen.getByLabelText('Add Truck'), 'STM-A40_0001')
    await user.click(screen.getByRole('button', { name: 'Add Truck' }))
    expect(screen.getByText('S1/02')).toBeInTheDocument() // auto-derived new Front No preview

    await user.click(screen.getByRole('button', { name: 'Save Front' }))

    expect(store.appendFrontContinuation).toHaveBeenCalledTimes(1)
    const [, params] = store.appendFrontContinuation.mock.calls[0] as [ShiftId, { fleetSetup: FleetSetup }]
    expect(params.fleetSetup.fronts.map((front) => front.frontId).sort()).toEqual(['S1/01', 'S1/02'])
    const newFleet = params.fleetSetup.fleets.find((fleet) => fleet.frontId === 'S1/02')
    expect(newFleet).toMatchObject({ kind: 'BASE', truckIds: ['STM-A40_0001'] })
    // No DERIVED fleet was created for the new Front, so BR1/01 is never retired.
    expect(onFleetUpdated).toHaveBeenCalledTimes(1)
  })
})
