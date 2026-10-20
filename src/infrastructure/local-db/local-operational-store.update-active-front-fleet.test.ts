import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { adjustFrontFleet } from '../../application/fleet-setup/adjust-front-fleet'
import { reconfigureActiveFrontFleet } from '../../application/fleet-setup/reconfigure-active-front-fleet'
import { buildExcaCode } from '../../domain/fleet/exca-code'
import { createFleetSetup } from '../../domain/fleet/fleet-setup'
import { createFrontDefinition } from '../../domain/fleet/front'
import { createHaulageTransaction } from '../../domain/haulage/haulage-transaction'
import {
  buildFixtureFleetSetup,
  buildFixtureProductionRecord,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureFleetId,
  fixturePosition,
  fixtureShiftId,
  fixtureTransactionId,
  fixtureTruckId,
  FIXTURE_FLEET_ID,
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
  it('persists an Exca revision through Edit Fleet reload without altering existing Production records', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('PILE-EXCA-HISTORY')
    const baseSetup = buildFixtureFleetSetup(masterData, pile.id)
    const currentExca = buildExcaCode('H1', '698')
    const nextExca = buildExcaCode('H1', '321')
    expect(currentExca.ok && nextExca.ok).toBe(true)
    if (!currentExca.ok || !nextExca.ok) return
    const originalFront = baseSetup.fronts[0]!
    const initialSetup = createFleetSetup({
      fronts: [createFrontDefinition(originalFront.frontId, originalFront.sectorCode, originalFront.haulerCode, originalFront.destinationPileId, currentExca.value)],
      fleets: baseSetup.fleets,
    }, masterData)
    expect(initialSetup.ok).toBe(true)
    if (!initialSetup.ok) return
    const shift = buildFixtureShift('SHIFT-EXCA-HISTORY')
    const store = new LocalOperationalStore(databaseName)
    await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup: initialSetup.value })

    const revised = reconfigureActiveFrontFleet({
      fleetSetup: initialSetup.value,
      masterData,
      frontId: FIXTURE_FRONT_ID,
      destinationPileIds: originalFront.destinationPileIds?.map(String) ?? (originalFront.destinationPileId ? [String(originalFront.destinationPileId)] : []),
      excaCode: nextExca.value,
      truckIds: [FIXTURE_IN_FLEET_TRUCK_ID],
      excaRevision: { revisionId: 'EXCA-REVISION-1', fleetAssignmentId: fixtureFleetId(FIXTURE_FLEET_ID), previousExcaCode: currentExca.value, excaCode: nextExca.value, effectiveAt: new Date('2026-10-19T01:00:00Z'), recordedAt: new Date('2026-10-19T01:01:00Z'), actorId: 'CHECKER' },
    })
    expect(revised.ok).toBe(true)
    if (!revised.ok) return
    expect((await store.updateActiveFrontFleetWithProductionGuard(shift.id, fixtureFleetId(FIXTURE_FLEET_ID), revised.value.fleetSetup, false)).ok).toBe(true)
    store.close()

    const reopened = new LocalOperationalStore(databaseName)
    const reloaded = await reopened.loadCurrentShiftWorkspace()
    expect(reloaded).toMatchObject({ ok: true })
    const fleet = reloaded.ok ? reloaded.value?.fleetSetup.fleets.find((candidate) => candidate.fleetId === fixtureFleetId(FIXTURE_FLEET_ID)) : undefined
    const front = reloaded.ok && fleet ? reloaded.value?.fleetSetup.fronts.find((candidate) => candidate.frontId === fleet.frontId) : undefined
    expect(front?.excaCode).toBe(nextExca.value)
    expect(fleet?.excaConfigurationHistory).toMatchObject([{ revisionId: 'EXCA-REVISION-1', previousExcaCode: currentExca.value, excaCode: nextExca.value, actorId: 'CHECKER' }])
    reopened.close()
  })

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

  it('atomically blocks configuration edits after any Production history while allowing an additive truck update without rewriting history', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')
    await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })

    const transaction = createHaulageTransaction({
      id: fixtureTransactionId('TXN-HISTORY'), shiftId: shift.id, pile, batchPosition: fixturePosition(1, 1),
      fleetId: fixtureFleetId('FLEET-A'), truckId: fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID), masterData, fleetSetup,
    })
    expect(transaction.ok).toBe(true)
    if (!transaction.ok) return
    expect((await store.addHaulageTransaction(transaction.value)).ok).toBe(true)
    const history = buildFixtureProductionRecord({ transaction: transaction.value, disposition: 'REJECT' })
    expect((await store.addProductionRecord(history)).ok).toBe(true)

    const adjusted = adjustFrontFleet({
      fleetSetup, masterData, frontId: FIXTURE_FRONT_ID, truckIds: [FIXTURE_IN_FLEET_TRUCK_ID, FIXTURE_WRONG_TRUCK_TRUCK_ID],
    })
    expect(adjusted.ok).toBe(true)
    if (!adjusted.ok) return

    const edit = await store.updateActiveFrontFleetWithProductionGuard(shift.id, fixtureFleetId('FLEET-A'), adjusted.value.fleetSetup, true)
    expect(edit.ok).toBe(false)
    if (!edit.ok) expect(edit.error.code).toBe('FLEET_CONFIGURATION_LOCKED_BY_PRODUCTION')
    expect(await store.getProductionRecord(transaction.value.id)).toEqual({ ok: true, value: history })

    const addTruck = await store.updateActiveFrontFleetWithProductionGuard(shift.id, fixtureFleetId('FLEET-A'), adjusted.value.fleetSetup, false)
    expect(addTruck.ok).toBe(true)
    expect(await store.getProductionRecord(transaction.value.id)).toEqual({ ok: true, value: history })
    store.close()
  })
})
