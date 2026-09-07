import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { adjustFrontFleet } from '../../application/fleet-setup/adjust-front-fleet'
import { createHaulageTransaction } from '../../domain/haulage/haulage-transaction'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureFleetId,
  fixturePosition,
  fixtureShiftId,
  fixtureTransactionId,
  fixtureTruckId,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
} from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  const name = `update-active-front-fleet-store-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
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

describe('LocalOperationalStore.updateActiveFrontFleet', () => {
  it('persists a persistent unit adjustment, and it survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData) // F1 = { T1 }
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const firstStore = new LocalOperationalStore(databaseName)
    await firstStore.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })

    const adjustment = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: FIXTURE_FRONT_ID,
      truckIds: [FIXTURE_WRONG_TRUCK_TRUCK_ID],
    })
    expect(adjustment.ok).toBe(true)
    if (!adjustment.ok) return

    const updateResult = await firstStore.updateActiveFrontFleet(shift.id, adjustment.value.fleetSetup)
    expect(updateResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    // Front ID is unchanged — this is not a continuation.
    expect(loaded.value?.fleetSetup.fronts.map((front) => front.frontId)).toEqual([FIXTURE_FRONT_ID])
    const fleet = loaded.value?.fleetSetup.fleets.find((candidate) => candidate.frontId === FIXTURE_FRONT_ID)
    expect(fleet).toMatchObject({ kind: 'BASE', truckIds: [FIXTURE_WRONG_TRUCK_TRUCK_ID] })
    reopenedStore.close()
  })

  it('fails with SHIFT_WORKSPACE_NOT_FOUND when no workspace exists for this shift', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = await store.updateActiveFrontFleet(fixtureShiftId('SHIFT-MISSING'), fleetSetup)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('reclassifies only NEW haulage against the updated fleet — a previously recorded transaction keeps its original classification', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData) // F1 = { T1 }; T2 is a known but out-of-fleet truck
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })

    // Rit 1, before the adjustment: T1 is in the effective fleet — VALID.
    const beforeAdjustment = createHaulageTransaction({
      id: fixtureTransactionId('TXN-1'),
      shiftId: shift.id,
      pile,
      batchPosition: fixturePosition(1, 1),
      fleetId: fixtureFleetId('FLEET-A'),
      truckId: fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID),
      masterData,
      fleetSetup,
    })
    expect(beforeAdjustment.ok).toBe(true)
    if (!beforeAdjustment.ok) return
    expect(beforeAdjustment.value.truckValidation.status).toBe('VALID')
    const addResult = await store.addHaulageTransaction(beforeAdjustment.value)
    expect(addResult.ok).toBe(true)

    // Persistent adjustment: T1 out, T2 in — same Front, no successor.
    const adjustment = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: FIXTURE_FRONT_ID,
      truckIds: [FIXTURE_WRONG_TRUCK_TRUCK_ID],
    })
    expect(adjustment.ok).toBe(true)
    if (!adjustment.ok) return
    const updateResult = await store.updateActiveFrontFleet(shift.id, adjustment.value.fleetSetup)
    expect(updateResult.ok).toBe(true)

    // The already-recorded transaction is untouched — still VALID, still referencing T1.
    const reloadedTransaction = await store.getHaulageTransaction(beforeAdjustment.value.id)
    expect(reloadedTransaction.ok).toBe(true)
    if (!reloadedTransaction.ok) return
    expect(reloadedTransaction.value).toEqual(beforeAdjustment.value)
    expect(reloadedTransaction.value?.truckValidation.status).toBe('VALID')

    const workspace = await store.loadCurrentShiftWorkspace()
    expect(workspace.ok).toBe(true)
    if (!workspace.ok || !workspace.value) return

    // Rit 2, after the adjustment, against the freshly stored fleet: T2 (newly added) is now VALID.
    const afterAdjustmentNewTruck = createHaulageTransaction({
      id: fixtureTransactionId('TXN-2'),
      shiftId: shift.id,
      pile,
      batchPosition: fixturePosition(1, 2),
      fleetId: fixtureFleetId('FLEET-A'),
      truckId: fixtureTruckId(FIXTURE_WRONG_TRUCK_TRUCK_ID),
      masterData,
      fleetSetup: workspace.value.fleetSetup,
    })
    expect(afterAdjustmentNewTruck.ok).toBe(true)
    if (afterAdjustmentNewTruck.ok) expect(afterAdjustmentNewTruck.value.truckValidation.status).toBe('VALID')

    // Rit 3, after the adjustment: T1 (removed) is now TRUCK SALAH.
    const afterAdjustmentOldTruck = createHaulageTransaction({
      id: fixtureTransactionId('TXN-3'),
      shiftId: shift.id,
      pile,
      batchPosition: fixturePosition(1, 3),
      fleetId: fixtureFleetId('FLEET-A'),
      truckId: fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID),
      masterData,
      fleetSetup: workspace.value.fleetSetup,
    })
    expect(afterAdjustmentOldTruck.ok).toBe(true)
    if (afterAdjustmentOldTruck.ok) expect(afterAdjustmentOldTruck.value.truckValidation.status).toBe('WRONG_TRUCK')

    store.close()
  })
})
