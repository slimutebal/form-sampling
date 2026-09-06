import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { appendFrontContinuation } from '../../application/fleet-setup/append-front-continuation'
import { parseOreCode, parseSectorCode } from '../../domain/common/codes'
import { createBaseFleetDefinition } from '../../domain/fleet/fleet-definition'
import { createFleetSetup } from '../../domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId } from '../../domain/fleet/front'
import { parseHaulerCode, parsePileAreaCode } from '../../domain/master/master-codes'
import { createHaulerReference, createPileAreaReference, createSectorReference, createTruckReference } from '../../domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '../../domain/master/sampling-config'
import { createMasterData, type MasterData } from '../../domain/master/master-data'
import { createHaulageTransaction } from '../../domain/haulage/haulage-transaction'
import { createBatchPosition } from '../../domain/batch/batch-position'
import { parseBatchNumber } from '../../domain/batch/batch-number'
import { parseRitNumber } from '../../domain/batch/rit-number'
import { parseHaulageTransactionId } from '../../domain/common/identifiers'
import { createPile } from '../../domain/pile/pile'
import type { FleetSetup } from '../../domain/fleet/fleet-setup'
import {
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureFleetId,
  fixturePileId,
  fixtureShiftId,
  fixtureTruckId,
} from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

function must<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.error)}`)
  return result.value as T
}

const SECTOR_CODE = 'S1'
const HAULER_CODE = 'H1'

function buildMasterData(): MasterData {
  const sector = must(parseSectorCode(SECTOR_CODE))
  const hauler = must(parseHaulerCode(HAULER_CODE))
  const ore = must(parseOreCode('SAP'))
  const stockpile = must(parsePileAreaCode('STK-1'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(sector, stockpile, fixturePileId('PILE-1'), ore),
        createPileAreaReference(sector, stockpile, fixturePileId('PILE-2'), ore),
      ],
      haulers: [createHaulerReference(hauler)],
      trucks: [createTruckReference(fixtureTruckId('T1'), hauler), createTruckReference(fixtureTruckId('T2'), hauler)],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: ore,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

/** One BASE Front `S1/01` with Destination PILE-1, formatted the way real production Fronts are (via createFrontId), not a raw test-only id. */
function buildInitialFleetSetup(masterData: MasterData): FleetSetup {
  const sector = must(parseSectorCode(SECTOR_CODE))
  const hauler = must(parseHaulerCode(HAULER_CODE))
  const front = createFrontDefinition(must(createFrontId(sector, 1)), sector, hauler, fixturePileId('PILE-1'))
  const fleet = must(
    createBaseFleetDefinition({
      fleetId: fixtureFleetId('FLEET-01'),
      frontId: must(createFrontId(sector, 1)),
      truckIds: [fixtureTruckId('T1')],
    }),
  )
  return must(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  const name = `append-front-continuation-store-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
  createdDatabaseNames.push(name)
  return name
}

function newStore(): LocalOperationalStore {
  return new LocalOperationalStore(uniqueDatabaseName())
}

afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('LocalOperationalStore.appendFrontContinuation', () => {
  it('persists a continuation FleetSetup, and it survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildMasterData()
    const fleetSetup = buildInitialFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const firstStore = new LocalOperationalStore(databaseName)
    const initResult = await firstStore.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const continuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'S1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-02',
    })
    expect(continuation.ok).toBe(true)
    if (!continuation.ok) return

    const appendResult = await firstStore.appendFrontContinuation(shift.id, { fleetSetup: continuation.value.fleetSetup })
    expect(appendResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.fleetSetup.fronts.map((front) => front.frontId).sort()).toEqual(['S1/01', 'S1/02'])
    reopenedStore.close()
  })

  it('activates a destination Pile not yet in the workspace, in the same atomic write', async () => {
    const store = newStore()
    const masterData = buildMasterData()
    const fleetSetup = buildInitialFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile1 = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile1], masterData, fleetSetup })

    const continuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'S1/01',
      destinationPileId: 'PILE-2',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-02',
    })
    expect(continuation.ok).toBe(true)
    if (!continuation.ok) return

    const activatePile = createPile(fixturePileId('PILE-2'), must(parseOreCode('SAP')))
    const appendResult = await store.appendFrontContinuation(shift.id, {
      fleetSetup: continuation.value.fleetSetup,
      activatePile,
    })
    expect(appendResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((candidate) => candidate.id).sort()).toEqual(['PILE-1', 'PILE-2'])
    // The old destination Pile is never removed from the workspace merely because no active Front points to it anymore.
    expect(loaded.value?.piles.some((candidate) => candidate.id === 'PILE-1')).toBe(true)
    store.close()
  })

  it('does not duplicate a Pile that is already part of the workspace when activatePile is passed anyway', async () => {
    const store = newStore()
    const masterData = buildMasterData()
    const fleetSetup = buildInitialFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile1 = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile1], masterData, fleetSetup })

    const continuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'S1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-02',
    })
    expect(continuation.ok).toBe(true)
    if (!continuation.ok) return

    const appendResult = await store.appendFrontContinuation(shift.id, {
      fleetSetup: continuation.value.fleetSetup,
      activatePile: pile1,
    })
    expect(appendResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles).toHaveLength(1)
    store.close()
  })

  it('fails with SHIFT_WORKSPACE_NOT_FOUND when no workspace exists for this shift', async () => {
    const store = newStore()
    const masterData = buildMasterData()
    const fleetSetup = buildInitialFleetSetup(masterData)

    const result = await store.appendFrontContinuation(fixtureShiftId('SHIFT-MISSING'), { fleetSetup })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('never touches an already-stored HaulageTransaction — history remains unchanged after a continuation', async () => {
    const store = newStore()
    const masterData = buildMasterData()
    const fleetSetup = buildInitialFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile1 = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile1], masterData, fleetSetup })

    const originalTransaction = must(
      createHaulageTransaction({
        id: must(parseHaulageTransactionId('TXN-1')),
        shiftId: shift.id,
        pile: pile1,
        batchPosition: createBatchPosition(must(parseBatchNumber(1)), must(parseRitNumber(1))),
        fleetId: fixtureFleetId('FLEET-01'),
        truckId: fixtureTruckId('T1'),
        masterData,
        fleetSetup,
      }),
    )
    const addResult = await store.addHaulageTransaction(originalTransaction)
    expect(addResult.ok).toBe(true)

    const continuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'S1/01',
      addedTruckIds: [],
      removedTruckIds: ['T1'],
      fleetId: 'FLEET-02',
    })
    expect(continuation.ok).toBe(true)
    if (!continuation.ok) return

    const appendResult = await store.appendFrontContinuation(shift.id, { fleetSetup: continuation.value.fleetSetup })
    expect(appendResult.ok).toBe(true)

    const reloadedTransaction = await store.getHaulageTransaction(originalTransaction.id)
    expect(reloadedTransaction.ok).toBe(true)
    if (!reloadedTransaction.ok) return
    expect(reloadedTransaction.value).toEqual(originalTransaction)
    expect(reloadedTransaction.value?.fleetId).toBe('FLEET-01')
    expect(reloadedTransaction.value?.truckValidation.status).toBe('VALID')
    store.close()
  })
})
