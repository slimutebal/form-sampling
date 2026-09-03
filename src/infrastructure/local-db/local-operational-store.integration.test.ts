import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixturePileId,
  fixtureShiftId,
  fixtureTransactionId,
} from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  const name = `local-operational-store-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  createdDatabaseNames.push(name)
  return name
}

// Every fake-indexeddb database this suite creates is deleted after its
// test — closing a connection does not delete the underlying database.
afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('LocalOperationalStore — full offline-resume durability', () => {
  it('a shift with multiple piles, master/fleet snapshots, and a sampled WRONG_TRUCK transaction survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()

    // --- Session 1: record a shift while "online" (first app run) ---
    const firstSession = new LocalOperationalStore(databaseName)

    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-DURABILITY')
    const piles = [
      buildFixtureSapPile('PILE-1'),
      buildFixtureSapPile('PILE-2'),
      buildFixtureSapPile('PILE-3'),
    ]

    const initResult = await firstSession.initializeShiftWorkspace({
      shift,
      piles,
      masterData,
      fleetSetup,
    })
    expect(initResult.ok).toBe(true)

    const wrongTruckTransaction = buildFixtureHaulageTransaction({
      id: 'TX-DURABILITY-1',
      shiftId: 'SHIFT-DURABILITY',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    expect(wrongTruckTransaction.truckValidation.status).toBe('WRONG_TRUCK')
    expect(wrongTruckTransaction.samplingEvaluation.sampleRequired).toBe(true)

    const validTransaction = buildFixtureHaulageTransaction({
      id: 'TX-DURABILITY-2',
      shiftId: 'SHIFT-DURABILITY',
      pile: piles[1],
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })

    const addWrongTruck = await firstSession.addHaulageTransaction(wrongTruckTransaction)
    const addValid = await firstSession.addHaulageTransaction(validTransaction)
    expect(addWrongTruck.ok).toBe(true)
    expect(addValid.ok).toBe(true)

    // Simulate the browser/app closing.
    firstSession.close()

    // --- Session 2: app restarts, must resume the exact same state ---
    const secondSession = new LocalOperationalStore(databaseName)

    const resumedWorkspace = await secondSession.loadCurrentShiftWorkspace()
    expect(resumedWorkspace.ok).toBe(true)
    if (!resumedWorkspace.ok) return
    expect(resumedWorkspace.value).toBeDefined()
    expect(resumedWorkspace.value?.shiftId).toBe('SHIFT-DURABILITY')
    expect(resumedWorkspace.value?.shift.status).toBe('ACTIVE')
    expect(resumedWorkspace.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1', 'PILE-2', 'PILE-3'])
    expect(resumedWorkspace.value?.masterData.trucks).toHaveLength(2)
    expect(resumedWorkspace.value?.fleetSetup.fleets).toHaveLength(1)

    const resumedWrongTruck = await secondSession.getHaulageTransaction(fixtureTransactionId('TX-DURABILITY-1'))
    expect(resumedWrongTruck.ok).toBe(true)
    if (!resumedWrongTruck.ok) return
    expect(resumedWrongTruck.value?.truckId).toBe(FIXTURE_WRONG_TRUCK_TRUCK_ID)
    expect(resumedWrongTruck.value?.truckValidation.status).toBe('WRONG_TRUCK')
    if (resumedWrongTruck.value?.truckValidation.status === 'WRONG_TRUCK') {
      expect(resumedWrongTruck.value.truckValidation.reasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    }
    expect(resumedWrongTruck.value?.samplingEvaluation.sampleRequired).toBe(true)
    if (resumedWrongTruck.value?.samplingEvaluation.sampleRequired) {
      expect(Number(resumedWrongTruck.value.samplingEvaluation.incrementNumber)).toBe(6)
    }

    const shiftTransactions = await secondSession.listHaulageTransactionsForShift(fixtureShiftId('SHIFT-DURABILITY'))
    expect(shiftTransactions.ok).toBe(true)
    if (!shiftTransactions.ok) return
    expect(shiftTransactions.value.map((tx) => tx.id).sort()).toEqual(['TX-DURABILITY-1', 'TX-DURABILITY-2'])

    const pile1Transactions = await secondSession.listHaulageTransactionsForShiftPile(
      fixtureShiftId('SHIFT-DURABILITY'),
      fixturePileId('PILE-1'),
    )
    expect(pile1Transactions.ok).toBe(true)
    if (!pile1Transactions.ok) return
    expect(pile1Transactions.value.map((tx) => tx.id)).toEqual(['TX-DURABILITY-1'])

    const pile3Transactions = await secondSession.listHaulageTransactionsForShiftPile(
      fixtureShiftId('SHIFT-DURABILITY'),
      fixturePileId('PILE-3'),
    )
    expect(pile3Transactions.ok).toBe(true)
    if (!pile3Transactions.ok) return
    expect(pile3Transactions.value).toEqual([])

    secondSession.close()
  })
})
