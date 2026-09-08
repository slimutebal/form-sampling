import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotPickedUpDelivery } from '../../domain/sample-handling/delivery-status'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
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

describe('LocalOperationalStore — v2 to v3 schema migration (Phase 12 rule 9)', () => {
  it('existing v2 shiftWorkspace/haulageTransaction/samplePosition data survives opening through the v3-aware store, and importHistory becomes usable', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    // 1. Create a legacy schema-v2 database directly with Dexie, using
    // the exact v2 `.stores()` shape — bypassing LocalOperationalStore
    // entirely so this test does not depend on the current (v3) store
    // already knowing how to write v2 data. Deliberately omits
    // pendingBatches/pendingSamples on the workspace row: a real v2 row
    // predates those fields (rule 9 — v1/v2 migrations must be
    // preserved unchanged).
    const legacyDb = new Dexie(databaseName)
    legacyDb.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
    })
    legacyDb.version(2).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
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

    const samplePosition = buildFixtureSamplePosition({
      id: 'SP-LEGACY-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    await legacyDb.table('samplePositions').add({
      id: samplePosition.id,
      shiftId: samplePosition.shiftId,
      pileId: samplePosition.pileId,
      samplePosition,
    })

    // 2. Close the legacy connection before reopening through the real store.
    legacyDb.close()

    // 3. Open the same database name through the current (v3) store —
    // this triggers Dexie's in-place v2 -> v3 upgrade.
    const store = new LocalOperationalStore(databaseName)

    // 4. Existing v2 data is still readable — nothing was deleted, and
    // the pre-Phase-12 workspace row defaults its carry-over state to
    // empty arrays rather than throwing or losing data.
    const loadedWorkspace = await store.loadCurrentShiftWorkspace()
    expect(loadedWorkspace.ok).toBe(true)
    if (!loadedWorkspace.ok) return
    expect(loadedWorkspace.value?.shiftId).toBe('SHIFT-1')
    expect(loadedWorkspace.value?.piles.map((p) => p.id)).toEqual(['PILE-1'])
    expect(loadedWorkspace.value?.pendingBatches).toEqual([])
    expect(loadedWorkspace.value?.pendingSamples).toEqual([])

    const loadedSamplePosition = await store.getSamplePosition(fixtureSamplePositionId('SP-LEGACY-1'))
    expect(loadedSamplePosition.ok).toBe(true)
    if (!loadedSamplePosition.ok) return
    expect(loadedSamplePosition.value).toEqual(samplePosition)

    // 5. importHistory is usable after migration — recorded atomically
    // with a (new) Shift workspace via initializeShiftWorkspace's
    // handoverImport parameter (Phase 12 critical fix: there is no
    // standalone import-recording write path).
    const beforeImport = await store.hasImportedFingerprint('fp-after-migration')
    expect(beforeImport.ok).toBe(true)
    if (!beforeImport.ok) return
    expect(beforeImport.value).toBe(false)

    const recorded = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-AFTER-MIGRATION'),
      piles: [],
      masterData,
      fleetSetup,
      handoverImport: { fingerprint: 'fp-after-migration', sourceShiftId: fixtureShiftId('SHIFT-PREV-1'), schemaVersion: 1 },
    })
    expect(recorded.ok).toBe(true)

    const afterImport = await store.hasImportedFingerprint('fp-after-migration')
    expect(afterImport.ok).toBe(true)
    if (!afterImport.ok) return
    expect(afterImport.value).toBe(true)

    store.close()
  })
})

describe('LocalOperationalStore — v3 to v4 schema migration (Phase 16 §7)', () => {
  it('existing v3 shiftWorkspace/haulageTransaction/samplePosition/importHistory data survives opening through the v4-aware store, and masterDataCache/shiftSummarySync become usable', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    // 1. Create a legacy schema-v3 database directly with Dexie, using the
    // exact v1/v2/v3 `.stores()` shapes — bypassing LocalOperationalStore
    // entirely so this test does not depend on the current (v4) store
    // already knowing how to write v3 data.
    const legacyDb = new Dexie(databaseName)
    legacyDb.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
    })
    legacyDb.version(2).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
    })
    legacyDb.version(3).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
      importHistory: 'fingerprint',
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
      id: 'TX-LEGACY-V3',
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
    await legacyDb.table('importHistory').add({
      fingerprint: 'fp-legacy-v3',
      sourceShiftId: 'SHIFT-PREV-1',
      schemaVersion: 1,
    })

    // 2. Close the legacy connection before reopening through the real store.
    legacyDb.close()

    // 3. Open the same database name through the current (v4) store — this
    // triggers Dexie's in-place v3 -> v4 upgrade.
    const store = new LocalOperationalStore(databaseName)

    // 4. Existing v3 data is still readable — nothing was deleted.
    const loadedWorkspace = await store.loadCurrentShiftWorkspace()
    expect(loadedWorkspace.ok).toBe(true)
    if (!loadedWorkspace.ok) return
    expect(loadedWorkspace.value?.shiftId).toBe('SHIFT-1')
    expect(loadedWorkspace.value?.piles.map((p) => p.id)).toEqual(['PILE-1'])

    const loadedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-LEGACY-V3'))
    expect(loadedTransaction.ok).toBe(true)
    if (!loadedTransaction.ok) return
    expect(loadedTransaction.value).toEqual(transaction)

    const hasImport = await store.hasImportedFingerprint('fp-legacy-v3')
    expect(hasImport.ok).toBe(true)
    if (!hasImport.ok) return
    expect(hasImport.value).toBe(true)

    // 5. masterDataCache is usable after migration.
    const cacheBeforeReplace = await store.readCachedMasterData()
    expect(cacheBeforeReplace.ok).toBe(true)
    if (!cacheBeforeReplace.ok) return
    expect(cacheBeforeReplace.value).toBeUndefined()

    const fetchedAt = new Date('2026-09-04T10:00:00.000Z')
    const replaceResult = await store.replaceMasterDataCache(masterData, fetchedAt)
    expect(replaceResult.ok).toBe(true)

    const cacheAfterReplace = await store.readCachedMasterData()
    expect(cacheAfterReplace.ok).toBe(true)
    if (!cacheAfterReplace.ok) return
    expect(cacheAfterReplace.value?.fetchedAt).toEqual(fetchedAt)

    // 6. shiftSummarySync is usable after migration.
    const upsertResult = await store.upsertShiftSummarySyncRecord({
      shiftId: fixtureShiftId('SHIFT-1'),
      summary: {
        shiftId: fixtureShiftId('SHIFT-1'),
        date: shift.date,
        shiftCode: shift.shiftCode,
        sectorCode: shift.sectorCode,
        samplingHouseCode: shift.samplingHouseCode,
        ritTotal: 1,
        batchTotal: 1,
        incrementTotal: 0,
        wrongTruckTotal: 0,
      },
      status: 'PENDING',
      attemptCount: 0,
      updatedAt: fetchedAt,
    })
    expect(upsertResult.ok).toBe(true)

    const pending = await store.listPendingShiftSummarySyncRecords()
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    expect(pending.value.map((record) => record.shiftId)).toEqual(['SHIFT-1'])

    store.close()
  })
})

describe('LocalOperationalStore — v4 to v5 schema migration (Production Data Model)', () => {
  it('existing v4 haulageTransactions data survives opening through the v5-aware store, and every pre-existing transaction gets a legacy ProductionRecord', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    // 1. Create a legacy schema-v4 database directly with Dexie, using the
    // exact v1/v2/v3/v4 `.stores()` shapes — bypassing LocalOperationalStore
    // entirely so this test does not depend on the current (v5) store
    // already knowing how to write v4 data.
    const legacyDb = new Dexie(databaseName)
    legacyDb.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
    })
    legacyDb.version(2).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
    })
    legacyDb.version(3).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
      importHistory: 'fingerprint',
    })
    legacyDb.version(4).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
      importHistory: 'fingerprint',
      masterDataCache: 'key',
      shiftSummarySync: 'shiftId',
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
      id: 'TX-LEGACY-V4',
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

    // 3. Open the same database name through the current (v5) store — this
    // triggers Dexie's in-place v4 -> v5 upgrade.
    const store = new LocalOperationalStore(databaseName)

    // 4. Existing v4 data is still readable — nothing was deleted, and
    // every existing HaulageTransaction API keeps working unchanged.
    const loadedWorkspace = await store.loadCurrentShiftWorkspace()
    expect(loadedWorkspace.ok).toBe(true)
    if (!loadedWorkspace.ok) return
    expect(loadedWorkspace.value?.shiftId).toBe('SHIFT-1')
    expect(loadedWorkspace.value?.piles.map((p) => p.id)).toEqual(['PILE-1'])

    const loadedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-LEGACY-V4'))
    expect(loadedTransaction.ok).toBe(true)
    if (!loadedTransaction.ok) return
    expect(loadedTransaction.value).toEqual(transaction)

    // 5. The pre-existing transaction (which had no Production metadata)
    // gets a legacy ProductionRecord: disposition ACCEPT, status ACTIVE,
    // physicalCondition/contamination/remark null, no audit user/timestamp
    // invented, and an empty corrections history.
    const migratedRecord = await store.getProductionRecord(fixtureTransactionId('TX-LEGACY-V4'))
    expect(migratedRecord.ok).toBe(true)
    if (!migratedRecord.ok) return
    expect(migratedRecord.value?.transaction).toEqual(transaction)
    expect(migratedRecord.value?.effective).toEqual({
      batchPosition: transaction.batchPosition,
      frontId: transaction.frontId,
      fleetId: transaction.fleetId,
      truckId: transaction.truckId,
      truckValidation: transaction.truckValidation,
      physicalCondition: null,
      contamination: null,
      disposition: 'ACCEPT',
      remark: null,
      status: 'ACTIVE',
    })
    expect(migratedRecord.value?.audit).toEqual({
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null,
      corrections: [],
    })

    const migratedByShift = await store.listProductionRecordsForShift(fixtureShiftId('SHIFT-1'))
    expect(migratedByShift.ok).toBe(true)
    if (!migratedByShift.ok) return
    expect(migratedByShift.value.map((record) => record.transaction.id)).toEqual(['TX-LEGACY-V4'])

    // 6. A new, operator-created ProductionRecord can be written and read
    // after migration, for a HaulageTransaction added after the upgrade.
    const newTransaction = buildFixtureHaulageTransaction({
      id: 'TX-AFTER-MIGRATION',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      rit: 4,
      masterData,
      fleetSetup,
    })
    expect((await store.addHaulageTransaction(newTransaction)).ok).toBe(true)

    const newProductionRecord = buildFixtureProductionRecord({ transaction: newTransaction })
    const addResult = await store.addProductionRecord(newProductionRecord)
    expect(addResult.ok).toBe(true)

    const readBack = await store.getProductionRecord(fixtureTransactionId('TX-AFTER-MIGRATION'))
    expect(readBack.ok).toBe(true)
    if (!readBack.ok) return
    expect(readBack.value).toEqual(newProductionRecord)

    const byShiftPile = await store.listProductionRecordsForShiftPile(
      fixtureShiftId('SHIFT-1'),
      fixturePileId('PILE-1'),
    )
    expect(byShiftPile.ok).toBe(true)
    if (!byShiftPile.ok) return
    expect(byShiftPile.value.map((record) => record.transaction.id).sort()).toEqual([
      'TX-AFTER-MIGRATION',
      'TX-LEGACY-V4',
    ])

    store.close()
  })

  it('a fresh (never-existing) database opens directly at v5 with a usable productionRecords table', async () => {
    const databaseName = uniqueDatabaseName()
    const store = new LocalOperationalStore(databaseName)
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const initResult = await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    expect((await store.addHaulageTransaction(transaction)).ok).toBe(true)

    const addResult = await store.addProductionRecord(buildFixtureProductionRecord({ transaction }))
    expect(addResult.ok).toBe(true)
    store.close()
  })
})
