import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { editProductionRecord } from '../../application/production/edit-production-record'
import {
  applyProductionSwitchPlan,
  planProductionSwitch,
} from '../../application/production/switch-production-record'
import { voidProductionRecord } from '../../application/production/void-production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixturePosition,
  fixtureTransactionId,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  const name = `production-correction-store-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
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

const correctedBy = fixtureEmployeeId('12345')
const correctedAt = new Date('2026-09-08T02:14:00.000Z')

async function setupWorkspaceWithRecord(
  store: LocalOperationalStore,
  transactionId: string,
  batch: number,
  rit: number,
) {
  const masterData = buildFixtureMasterData()
  const fleetSetup = buildFixtureFleetSetup(masterData)
  const shift = buildFixtureShift('SHIFT-1')
  const pile = buildFixtureSapPile('PILE-1')
  await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })

  const transaction = buildFixtureHaulageTransaction({
    id: transactionId,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  const productionRecord = buildFixtureProductionRecord({ transaction })
  await store.addProductionTransaction({ transaction, productionRecord })
  return { masterData, fleetSetup, shift, pile, transaction, productionRecord }
}

describe('LocalOperationalStore.updateProductionRecordWithCorrection', () => {
  it('persists an EDIT_FIELDS correction, and it survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const firstStore = new LocalOperationalStore(databaseName)
    const { masterData, fleetSetup, productionRecord } = await setupWorkspaceWithRecord(firstStore, 'TX-1', 1, 1)

    const edited = editProductionRecord({
      record: productionRecord,
      allRecordsForShift: [productionRecord],
      masterData,
      fleetSetup,
      selectedFrontId: FIXTURE_FRONT_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      physicalCondition: 'WET',
      contamination: 'OVR',
      disposition: 'ACCEPT',
      reason: 'Salah input kondisi',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-1',
    })
    expect(edited.ok).toBe(true)
    if (!edited.ok) return

    const updateResult = await firstStore.updateProductionRecordWithCorrection(edited.value)
    expect(updateResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const reloaded = await reopenedStore.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.value?.effective.physicalCondition).toBe('WET')
    expect(reloaded.value?.effective.contamination).toBe('OVR')
    expect(reloaded.value?.audit.corrections).toHaveLength(1)
    expect(reloaded.value?.audit.corrections[0]?.type).toBe('EDIT_FIELDS')
    reopenedStore.close()
  })

  it('never overwrites previously persisted corrections', async () => {
    const store = newStore()
    const { masterData, fleetSetup, productionRecord } = await setupWorkspaceWithRecord(store, 'TX-1', 1, 1)

    const firstEdit = editProductionRecord({
      record: productionRecord,
      allRecordsForShift: [productionRecord],
      masterData,
      fleetSetup,
      selectedFrontId: FIXTURE_FRONT_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      physicalCondition: 'WET',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      reason: 'first correction',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-1',
    })
    if (!firstEdit.ok) throw new Error('setup failed')
    expect((await store.updateProductionRecordWithCorrection(firstEdit.value)).ok).toBe(true)

    const secondEdit = editProductionRecord({
      record: firstEdit.value,
      allRecordsForShift: [firstEdit.value],
      masterData,
      fleetSetup,
      selectedFrontId: FIXTURE_FRONT_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      physicalCondition: 'MOIST',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      reason: 'second correction',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-2',
    })
    if (!secondEdit.ok) throw new Error('setup failed')
    expect((await store.updateProductionRecordWithCorrection(secondEdit.value)).ok).toBe(true)

    const reloaded = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.value?.audit.corrections).toHaveLength(2)
    expect(reloaded.value?.audit.corrections[0]?.id).toBe('CORR-1')
    expect(reloaded.value?.audit.corrections[1]?.id).toBe('CORR-2')
    store.close()
  })

  it('rejects a REJECT -> ACCEPT edit that would occupy an already-occupied slot', async () => {
    const store = newStore()
    const { masterData, fleetSetup, pile, shift } = await setupWorkspaceWithRecord(store, 'TX-1', 1, 1)

    const occupantTransaction = buildFixtureHaulageTransaction({
      id: 'TX-2',
      shiftId: shift.id as string,
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const occupantRecord = buildFixtureProductionRecord({ transaction: occupantTransaction, disposition: 'ACCEPT' })
    expect((await store.addProductionTransaction({ transaction: occupantTransaction, productionRecord: occupantRecord })).ok).toBe(
      true,
    )

    const rejectTransaction = buildFixtureHaulageTransaction({
      id: 'TX-3',
      shiftId: shift.id as string,
      pile,
      batch: 1,
      rit: 1,
      masterData,
      fleetSetup,
    })
    const rejectRecord = buildFixtureProductionRecord({ transaction: rejectTransaction, disposition: 'REJECT' })
    expect((await store.addProductionTransaction({ transaction: rejectTransaction, productionRecord: rejectRecord })).ok).toBe(
      true,
    )

    const edited = editProductionRecord({
      record: rejectRecord,
      allRecordsForShift: [occupantRecord, rejectRecord],
      masterData,
      fleetSetup,
      selectedFrontId: FIXTURE_FRONT_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(edited.ok).toBe(false)
    store.close()
  })

  it('rejects at the persistence boundary a write that would duplicate an occupied slot, even if the application layer missed it', async () => {
    const store = newStore()
    const { masterData, fleetSetup, pile, shift } = await setupWorkspaceWithRecord(store, 'TX-1', 1, 1)

    const occupantTransaction = buildFixtureHaulageTransaction({
      id: 'TX-2',
      shiftId: shift.id as string,
      pile,
      batch: 4,
      rit: 9,
      masterData,
      fleetSetup,
    })
    const occupantRecord = buildFixtureProductionRecord({ transaction: occupantTransaction, disposition: 'ACCEPT' })
    expect((await store.addProductionTransaction({ transaction: occupantTransaction, productionRecord: occupantRecord })).ok).toBe(
      true,
    )

    // Force the stored TX-1 record's effective position to Batch 4 / Rit
    // 9 directly (bypassing planProductionSwitch's own conflict check) to
    // prove the store's own atomic-boundary re-check independently
    // rejects the duplicate slot.
    const stored = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    if (!stored.ok || !stored.value) throw new Error('setup failed')
    const forcedRecord = {
      ...stored.value,
      effective: { ...stored.value.effective, batchPosition: fixturePosition(4, 9) },
    } as typeof stored.value

    const result = await store.updateProductionRecordWithCorrection(forcedRecord)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_POSITION_OCCUPIED')

    const reloaded = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(Number(reloaded.value?.effective.batchPosition.batchNumber)).toBe(1)
    store.close()
  })
})

describe('LocalOperationalStore.voidProductionRecord', () => {
  it('persists a VOID_RECORD correction, and it survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const firstStore = new LocalOperationalStore(databaseName)
    const { productionRecord } = await setupWorkspaceWithRecord(firstStore, 'TX-1', 1, 1)

    const voided = voidProductionRecord({
      record: productionRecord,
      reason: 'Salah catat',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-VOID',
    })
    expect(voided.ok).toBe(true)
    if (!voided.ok) return

    expect((await firstStore.voidProductionRecord(voided.value)).ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const reloaded = await reopenedStore.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.value?.effective.status).toBe('VOIDED')
    expect(reloaded.value?.audit.corrections).toHaveLength(1)
    expect(reloaded.value?.audit.corrections[0]?.type).toBe('VOID_RECORD')
    reopenedStore.close()
  })
})

describe('LocalOperationalStore.switchProductionRecords', () => {
  it('MOVE persists close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const firstStore = new LocalOperationalStore(databaseName)
    const { productionRecord } = await setupWorkspaceWithRecord(firstStore, 'TX-1', 5, 1)

    const plan = planProductionSwitch(productionRecord, fixturePosition(4, 9), [productionRecord])
    if (!plan.ok) throw new Error('setup failed')
    const applied = applyProductionSwitchPlan({
      plan: plan.value,
      reason: 'Salah posisi ritase',
      correctedAt,
      correctedBy,
    })
    if (!applied.ok) throw new Error('setup failed')

    const result = await firstStore.switchProductionRecords({ updatedSource: applied.value.updatedSource })
    expect(result.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const reloaded = await reopenedStore.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(Number(reloaded.value?.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(reloaded.value?.effective.batchPosition.ritNumber)).toBe(9)
    reopenedStore.close()
  })

  it('SWAP persists close/reopen for both records', async () => {
    const databaseName = uniqueDatabaseName()
    const firstStore = new LocalOperationalStore(databaseName)
    const { masterData, fleetSetup, pile, shift, productionRecord } = await setupWorkspaceWithRecord(
      firstStore,
      'TX-1',
      5,
      1,
    )

    const targetTransaction = buildFixtureHaulageTransaction({
      id: 'TX-2',
      shiftId: shift.id as string,
      pile,
      batch: 4,
      rit: 9,
      masterData,
      fleetSetup,
    })
    const targetRecord = buildFixtureProductionRecord({ transaction: targetTransaction })
    expect((await firstStore.addProductionTransaction({ transaction: targetTransaction, productionRecord: targetRecord })).ok).toBe(
      true,
    )

    const plan = planProductionSwitch(productionRecord, fixturePosition(4, 9), [productionRecord, targetRecord])
    if (!plan.ok) throw new Error('setup failed')
    expect(plan.value.mode).toBe('SWAP')
    const applied = applyProductionSwitchPlan({ plan: plan.value, reason: 'reason', correctedAt, correctedBy })
    if (!applied.ok) throw new Error('setup failed')

    const result = await firstStore.switchProductionRecords({
      updatedSource: applied.value.updatedSource,
      updatedTarget: applied.value.updatedTarget,
    })
    expect(result.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const reloadedSource = await reopenedStore.getProductionRecord(fixtureTransactionId('TX-1'))
    const reloadedTarget = await reopenedStore.getProductionRecord(fixtureTransactionId('TX-2'))
    expect(reloadedSource.ok && reloadedTarget.ok).toBe(true)
    if (!reloadedSource.ok || !reloadedTarget.ok) return
    expect(Number(reloadedSource.value?.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(reloadedSource.value?.effective.batchPosition.ritNumber)).toBe(9)
    expect(Number(reloadedTarget.value?.effective.batchPosition.batchNumber)).toBe(5)
    expect(Number(reloadedTarget.value?.effective.batchPosition.ritNumber)).toBe(1)
    reopenedStore.close()
  })

  it('a failed SWAP (unknown target row) leaves the source row unchanged', async () => {
    const store = newStore()
    const { productionRecord } = await setupWorkspaceWithRecord(store, 'TX-1', 5, 1)

    const foreignTransaction = buildFixtureHaulageTransaction({
      id: 'TX-UNKNOWN',
      shiftId: 'SHIFT-1',
      pile: buildFixtureSapPile('PILE-1'),
      batch: 4,
      rit: 9,
      masterData: buildFixtureMasterData(),
      fleetSetup: buildFixtureFleetSetup(buildFixtureMasterData()),
    })
    const unpersistedTargetRecord = buildFixtureProductionRecord({ transaction: foreignTransaction })

    const movedSource = {
      ...productionRecord,
      effective: { ...productionRecord.effective, batchPosition: fixturePosition(4, 9) },
    } as typeof productionRecord
    const movedTarget = {
      ...unpersistedTargetRecord,
      effective: { ...unpersistedTargetRecord.effective, batchPosition: fixturePosition(5, 1) },
    } as typeof unpersistedTargetRecord

    const result = await store.switchProductionRecords({ updatedSource: movedSource, updatedTarget: movedTarget })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_RECORD_NOT_FOUND')

    const reloaded = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(Number(reloaded.value?.effective.batchPosition.batchNumber)).toBe(5)
    expect(Number(reloaded.value?.effective.batchPosition.ritNumber)).toBe(1)
    store.close()
  })

  it('rejects a duplicate occupied ACCEPT slot at the atomic persistence boundary', async () => {
    const store = newStore()
    const { masterData, fleetSetup, pile, shift, productionRecord } = await setupWorkspaceWithRecord(
      store,
      'TX-1',
      5,
      1,
    )

    const thirdPartyTransaction = buildFixtureHaulageTransaction({
      id: 'TX-3',
      shiftId: shift.id as string,
      pile,
      batch: 4,
      rit: 9,
      masterData,
      fleetSetup,
    })
    const thirdPartyRecord = buildFixtureProductionRecord({ transaction: thirdPartyTransaction, disposition: 'ACCEPT' })
    expect((await store.addProductionTransaction({ transaction: thirdPartyTransaction, productionRecord: thirdPartyRecord })).ok).toBe(
      true,
    )

    // Simulate a stale MOVE plan computed before TX-3 existed: moving TX-1
    // straight into Batch 4 / Rit 9 without going through
    // `planProductionSwitch` again — the store's own re-check must still
    // reject it.
    const movedSource = {
      ...productionRecord,
      effective: { ...productionRecord.effective, batchPosition: fixturePosition(4, 9) },
    } as typeof productionRecord

    const result = await store.switchProductionRecords({ updatedSource: movedSource })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_POSITION_OCCUPIED')

    const reloaded = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(Number(reloaded.value?.effective.batchPosition.batchNumber)).toBe(5)
    store.close()
  })
})
