import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordHaulage } from '@/application/haulage-operation/create-haulage-record'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_FLEET_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  fixturePosition,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { LocalOperationalStore } from '@/infrastructure/local-db/local-operational-store'

function uniqueDatabaseName(): string {
  return `pile-haulage-flow-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('Pile Haulage recording — real LocalOperationalStore integration', () => {
  let databaseName: string
  let store: LocalOperationalStore

  beforeEach(() => {
    databaseName = uniqueDatabaseName()
    store = new LocalOperationalStore(databaseName)
  })

  afterEach(async () => {
    store.close()
    await Dexie.delete(databaseName)
  })

  it('persists a recorded transaction snapshot that survives a store close/reopen', async () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('shift-haulage-integration-1')
    const pile = buildFixtureSapPile('PILE-1')

    const initializeResult = await store.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
    })
    expect(initializeResult.ok).toBe(true)

    const created = recordHaulage({
      generatedTransactionId: 'TX-INTEGRATION-1',
      shift,
      pile,
      nextPosition: fixturePosition(1, 2),
      selectedFleetId: FIXTURE_FLEET_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      masterData,
      fleetSetup,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const addResult = await store.addHaulageTransaction(created.value)
    expect(addResult.ok).toBe(true)

    // Close and reopen against the same database name, proving the write
    // survives a store instance boundary rather than only an in-memory cache.
    store.close()
    store = new LocalOperationalStore(databaseName)

    const listed = await store.listHaulageTransactionsForShiftPile(shift.id, pile.id)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    expect(listed.value).toHaveLength(1)
    const persisted = listed.value[0]!
    expect(persisted.id).toBe(created.value.id)
    expect(persisted.batchPosition).toEqual(created.value.batchPosition)
    expect(persisted.samplingEvaluation).toEqual(created.value.samplingEvaluation)
    expect(persisted.truckValidation).toEqual(created.value.truckValidation)
  })
})
