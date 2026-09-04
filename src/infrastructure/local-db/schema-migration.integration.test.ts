import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotPickedUpDelivery } from '../../domain/sample-handling/delivery-status'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  fixturePileId,
  fixtureSamplePositionId,
  fixtureShiftId,
  fixtureTransactionId,
} from './local-db-test-fixtures'
import { CURRENT_SHIFT_METADATA_KEY, type HaulageTransactionRecord, type ShiftWorkspaceRecord } from './records'
import { LocalOperationalStore } from './local-operational-store'

const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  const name = `schema-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  createdDatabaseNames.push(name)
  return name
}

afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('LocalOperationalStore — v1 to v2 schema migration (Phase 11 §21/§24)', () => {
  it('existing v1 shiftWorkspace/haulageTransaction data survives opening through the v2-aware store, and a new SamplePosition can be written/read', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    // 1. Create a legacy schema-v1 database directly with Dexie, using
    // the exact v1 `.stores()` shape — bypassing LocalOperationalStore
    // entirely so this test does not depend on the current (v2) store
    // already knowing how to write v1 data.
    const legacyDb = new Dexie(databaseName)
    legacyDb.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
    })

    const workspaceRecord: ShiftWorkspaceRecord = {
      shiftId: shift.id,
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
    }
    await legacyDb.table('shiftWorkspaces').add(workspaceRecord)
    await legacyDb.table('metadata').put({ key: CURRENT_SHIFT_METADATA_KEY, value: shift.id })

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-LEGACY-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const transactionRecord: HaulageTransactionRecord = {
      id: transaction.id,
      shiftId: transaction.shiftId,
      pileId: transaction.pileId,
      transaction,
    }
    await legacyDb.table('haulageTransactions').add(transactionRecord)

    // 2. Close the legacy connection before reopening through the real store.
    legacyDb.close()

    // 3. Open the same database name through the current (v2) store —
    // this triggers Dexie's in-place v1 -> v2 upgrade.
    const store = new LocalOperationalStore(databaseName)

    // 4. Existing v1 data is still readable — nothing was deleted.
    const loadedWorkspace = await store.loadCurrentShiftWorkspace()
    expect(loadedWorkspace.ok).toBe(true)
    if (!loadedWorkspace.ok) return
    expect(loadedWorkspace.value?.shiftId).toBe('SHIFT-1')
    expect(loadedWorkspace.value?.piles.map((p) => p.id)).toEqual(['PILE-1'])

    const loadedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-LEGACY-1'))
    expect(loadedTransaction.ok).toBe(true)
    if (!loadedTransaction.ok) return
    expect(loadedTransaction.value).toEqual(transaction)

    // 5. A new SamplePosition can be written and read after migration.
    const samplePosition = buildFixtureSamplePosition({
      id: 'SP-AFTER-MIGRATION',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const addResult = await store.addSamplePosition(samplePosition)
    expect(addResult.ok).toBe(true)

    const readBack = await store.getSamplePosition(fixtureSamplePositionId('SP-AFTER-MIGRATION'))
    expect(readBack.ok).toBe(true)
    if (!readBack.ok) return
    expect(readBack.value).toEqual(samplePosition)

    const byShiftPile = await store.listSamplePositionsForShiftPile(fixtureShiftId('SHIFT-1'), fixturePileId('PILE-1'))
    expect(byShiftPile.ok).toBe(true)
    if (!byShiftPile.ok) return
    expect(byShiftPile.value.map((p) => p.id)).toEqual(['SP-AFTER-MIGRATION'])

    store.close()
  })

  it('a fresh (never-existing) database opens directly at v2 with a usable samplePositions table', async () => {
    const databaseName = uniqueDatabaseName()
    const store = new LocalOperationalStore(databaseName)
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const initResult = await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const samplePosition = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const addResult = await store.addSamplePosition(samplePosition)
    expect(addResult.ok).toBe(true)
    store.close()
  })
})
