import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '../../domain/common/codes'
import { parsePileId } from '../../domain/common/identifiers'
import { parseBatchNumber } from '../../domain/batch/batch-number'
import { parseRitNumber } from '../../domain/batch/rit-number'
import { createManpowerAssignment } from '../../domain/manpower/manpower-assignment'
import { parsePileAreaCode } from '../../domain/master/master-codes'
import { createPileAreaReference } from '../../domain/master/references'
import { parseDeliveryDestinationCode } from '../../domain/sample-handling/delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '../../domain/sample-handling/delivery-status'
import type { Pile } from '../../domain/pile/pile'
import {
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSamplePosition,
  buildFixtureLimPile,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
  fixturePileId,
  fixtureSamplePositionId,
  fixtureShiftId,
  fixtureTransactionId,
} from './local-db-test-fixtures'
import { CURRENT_SHIFT_METADATA_KEY } from './records'
import { LocalOperationalStore } from './local-operational-store'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  const name = `local-operational-store-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
  createdDatabaseNames.push(name)
  return name
}

function newStore(): LocalOperationalStore {
  return new LocalOperationalStore(uniqueDatabaseName())
}

// Every fake-indexeddb database this suite creates is deleted after its
// test — closing a connection does not delete the underlying database.
afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('LocalOperationalStore — shift workspace', () => {
  it('A. no current shift on a fresh database returns ok(undefined)', async () => {
    const store = newStore()
    const result = await store.loadCurrentShiftWorkspace()
    expect(result).toEqual({ ok: true, value: undefined })
    store.close()
  })

  it('B. initializing a workspace marks it the current shift', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = [buildFixtureSapPile('PILE-1'), buildFixtureSapPile('PILE-2')]

    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.shiftId).toBe('SHIFT-1')
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1', 'PILE-2'])
    store.close()
  })

  it('B2. an initialized workspace with no manpower argument defaults to an empty array, never undefined', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')

    const initResult = await store.initializeShiftWorkspace({ shift, piles: [], masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.manpower).toEqual([])
    store.close()
  })

  it('B3. manpower round-trips through initialization and reload unchanged (Phase 18 §4)', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const manpower = [
      createManpowerAssignment(FIXTURE_EMPLOYEE_ID, 'John Doe', 'Checker', true),
      createManpowerAssignment('CREW-1', 'Jane Roe', 'Sampler', true),
    ]

    const firstStore = new LocalOperationalStore(databaseName)
    const initResult = await firstStore.initializeShiftWorkspace({
      shift,
      piles: [],
      masterData,
      fleetSetup,
      manpower,
    })
    expect(initResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    // Multiple PIC assignments must round-trip intact — no one-PIC-only
    // constraint anywhere in this persistence path.
    expect(loaded.value?.manpower).toEqual(manpower)
    reopenedStore.close()
  })

  it('C. workspace and current-shift pointer survive close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = [buildFixtureSapPile('PILE-1')]

    const firstStore = new LocalOperationalStore(databaseName)
    const initResult = await firstStore.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    expect(initResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.shiftId).toBe('SHIFT-1')
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    reopenedStore.close()
  })

  it('D. initializing the same ShiftId twice fails with SHIFT_WORKSPACE_ALREADY_EXISTS and leaves original data unchanged', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const originalPiles: Pile[] = [buildFixtureSapPile('PILE-1')]

    const first = await store.initializeShiftWorkspace({ shift, piles: originalPiles, masterData, fleetSetup })
    expect(first.ok).toBe(true)

    const conflictingPiles: Pile[] = [buildFixtureSapPile('PILE-DIFFERENT')]
    const second = await store.initializeShiftWorkspace({
      shift,
      piles: conflictingPiles,
      masterData,
      fleetSetup,
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('SHIFT_WORKSPACE_ALREADY_EXISTS')

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    store.close()
  })

  it('E. a workspace can store at least 8 distinct piles and all persist across reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = Array.from({ length: 8 }, (_, index) => buildFixtureSapPile(`PILE-${index + 1}`))

    const firstStore = new LocalOperationalStore(databaseName)
    const initResult = await firstStore.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    expect(initResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles).toHaveLength(8)
    expect(new Set(loaded.value?.piles.map((pile) => pile.id))).toEqual(
      new Set(piles.map((pile) => pile.id)),
    )
    reopenedStore.close()
  })

  it('F. a duplicate PileId within the supplied piles collection is rejected explicitly', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = [buildFixtureSapPile('PILE-1'), buildFixtureSapPile('PILE-1')]

    const result = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE')

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded).toEqual({ ok: true, value: undefined })
    store.close()
  })

  it('G. mutating the caller-owned pile array after initialization does not alter the stored workspace', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = [buildFixtureSapPile('PILE-1')]

    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    // Mutate the caller-owned array/object after storage via a test-only cast.
    piles.push(buildFixtureSapPile('PILE-INJECTED'))
    ;(piles[0] as { id: string }).id = 'MUTATED'

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    store.close()
  })

  it('H. initializing SHIFT-B does not delete SHIFT-A; current pointer moves to SHIFT-B', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const shiftA = buildFixtureShift('SHIFT-A')
    const shiftB = buildFixtureShift('SHIFT-B')

    const initA = await store.initializeShiftWorkspace({
      shift: shiftA,
      piles: [buildFixtureSapPile('PILE-A1')],
      masterData,
      fleetSetup,
    })
    expect(initA.ok).toBe(true)

    const initB = await store.initializeShiftWorkspace({
      shift: shiftB,
      piles: [buildFixtureSapPile('PILE-B1')],
      masterData,
      fleetSetup,
    })
    expect(initB.ok).toBe(true)

    const current = await store.loadCurrentShiftWorkspace()
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(current.value?.shiftId).toBe('SHIFT-B')

    const shiftAWorkspace = await store.loadShiftWorkspace(fixtureShiftId('SHIFT-A'))
    expect(shiftAWorkspace.ok).toBe(true)
    if (!shiftAWorkspace.ok) return
    expect(shiftAWorkspace.value?.shiftId).toBe('SHIFT-A')
    expect(shiftAWorkspace.value?.piles.map((pile) => pile.id)).toEqual(['PILE-A1'])
    store.close()
  })

  it('captures MasterData/FleetSetup exactly as of invocation, immune to a caller mutation racing the pending write', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const piles: Pile[] = [buildFixtureSapPile('PILE-1')]
    const originalHaulerCode = masterData.trucks[0].haulerCode

    const pending = store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })

    // Mutate the caller-owned MasterData/FleetSetup immediately, before
    // the pending write settles — this races the asynchronous integrity
    // work inside initializeShiftWorkspace, not merely a mutation after
    // the call has already resolved.
    ;(masterData.trucks[0] as { haulerCode: string }).haulerCode = 'MUTATED-HAULER'
    ;(fleetSetup.fronts[0] as { haulerCode: string }).haulerCode = 'MUTATED-HAULER'

    const initResult = await pending
    expect(initResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.masterData.trucks[0].haulerCode).toBe(originalHaulerCode)
    expect(loaded.value?.fleetSetup.fronts[0].haulerCode).toBe(originalHaulerCode)
    store.close()
  })

  it('a current-shift pointer with no matching workspace is reported as CURRENT_SHIFT_WORKSPACE_NOT_FOUND', async () => {
    // The public API cannot produce this state (the pointer is only ever
    // written atomically alongside its workspace) — it represents
    // corrupted/incomplete local state, so it is simulated here via a
    // strictly test-only Dexie instance pointed at the same database
    // name, bypassing LocalOperationalStore's own write path entirely.
    // Production code never gets this kind of access — see database.ts.
    const databaseName = uniqueDatabaseName()

    // 1. Open normally once, through the store, so the real schema exists.
    const bootstrapStore = new LocalOperationalStore(databaseName)
    await bootstrapStore.loadCurrentShiftWorkspace()
    bootstrapStore.close()

    // 2. Corrupt it via a raw, test-only Dexie handle to the same database.
    const rawTestDb = new Dexie(databaseName)
    rawTestDb.version(1).stores({ metadata: 'key' })
    await rawTestDb.table('metadata').put({ key: CURRENT_SHIFT_METADATA_KEY, value: fixtureShiftId('SHIFT-GHOST') })
    rawTestDb.close()

    // 3. Reopen through the store and assert the corruption is surfaced.
    const store = new LocalOperationalStore(databaseName)
    const result = await store.loadCurrentShiftWorkspace()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CURRENT_SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })
})

describe('LocalOperationalStore — addPileToWorkspace (Phase 18 "Add Pile" correction)', () => {
  it('A. adds a Pile to an existing workspace, preserving every other stored field', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')

    const initResult = await store.initializeShiftWorkspace({ shift, piles: [], masterData, fleetSetup })
    expect(initResult.ok).toBe(true)

    const addResult = await store.addPileToWorkspace(fixtureShiftId('SHIFT-1'), buildFixtureSapPile('PILE-1'))
    expect(addResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    expect(loaded.value?.shift.id).toBe('SHIFT-1')
    expect(loaded.value?.masterData).toEqual(masterData)
    store.close()
  })

  it('B. can add more than one Pile over separate calls', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [buildFixtureSapPile('PILE-1')], masterData, fleetSetup })

    const addResult = await store.addPileToWorkspace(fixtureShiftId('SHIFT-1'), buildFixtureLimPile('PILE-2'))
    expect(addResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id).sort()).toEqual(['PILE-1', 'PILE-2'])
    store.close()
  })

  it('C. a duplicate PileId already active in the workspace is rejected, leaving existing piles unchanged', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [buildFixtureSapPile('PILE-1')], masterData, fleetSetup })

    const addResult = await store.addPileToWorkspace(fixtureShiftId('SHIFT-1'), buildFixtureSapPile('PILE-1'))
    expect(addResult.ok).toBe(false)
    if (addResult.ok) return
    expect(addResult.error.code).toBe('DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE')

    const loaded = await store.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    store.close()
  })

  it('D. no workspace exists for the given ShiftId fails with SHIFT_WORKSPACE_NOT_FOUND', async () => {
    const store = newStore()

    const addResult = await store.addPileToWorkspace(fixtureShiftId('NEVER-INITIALIZED'), buildFixtureSapPile('PILE-1'))
    expect(addResult.ok).toBe(false)
    if (addResult.ok) return
    expect(addResult.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('E. an added Pile persists across close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')

    const firstStore = new LocalOperationalStore(databaseName)
    await firstStore.initializeShiftWorkspace({ shift, piles: [], masterData, fleetSetup })
    await firstStore.addPileToWorkspace(fixtureShiftId('SHIFT-1'), buildFixtureSapPile('PILE-1'))
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    reopenedStore.close()
  })
})

describe('LocalOperationalStore — confirmFreshPileStartPosition (post-inspection correction §6)', () => {
  it('A. sets freshPileStartPosition on the matching Pile, preserving every other stored field', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({
      shift,
      piles: [buildFixtureSapPile('PILE-1'), buildFixtureLimPile('PILE-2')],
      masterData,
      fleetSetup,
    })

    const startPosition = { batchNumber: must(parseBatchNumber(25)), ritNumber: must(parseRitNumber(11)) }
    const result = await store.confirmFreshPileStartPosition(fixtureShiftId('SHIFT-1'), must(parsePileId('PILE-1')), startPosition)
    expect(result.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const pile1 = loaded.value?.piles.find((pile) => pile.id === 'PILE-1')
    const pile2 = loaded.value?.piles.find((pile) => pile.id === 'PILE-2')
    expect(pile1?.freshPileStartPosition).toEqual(startPosition)
    expect(pile2?.freshPileStartPosition).toBeUndefined()
    store.close()
  })

  it('B. replaces a previously confirmed start position (still editable before first haulage)', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [buildFixtureSapPile('PILE-1')], masterData, fleetSetup })

    await store.confirmFreshPileStartPosition(fixtureShiftId('SHIFT-1'), must(parsePileId('PILE-1')), {
      batchNumber: must(parseBatchNumber(1)),
      ritNumber: must(parseRitNumber(1)),
    })
    const overridden = { batchNumber: must(parseBatchNumber(25)), ritNumber: must(parseRitNumber(11)) }
    await store.confirmFreshPileStartPosition(fixtureShiftId('SHIFT-1'), must(parsePileId('PILE-1')), overridden)

    const loaded = await store.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.find((pile) => pile.id === 'PILE-1')?.freshPileStartPosition).toEqual(overridden)
    store.close()
  })

  it('C. no matching Pile in the workspace fails with PILE_NOT_FOUND_IN_SHIFT_WORKSPACE', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [], masterData, fleetSetup })

    const result = await store.confirmFreshPileStartPosition(fixtureShiftId('SHIFT-1'), must(parsePileId('PILE-1')), {
      batchNumber: must(parseBatchNumber(1)),
      ritNumber: must(parseRitNumber(1)),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_NOT_FOUND_IN_SHIFT_WORKSPACE')
    store.close()
  })

  it('D. no workspace exists for the given ShiftId fails with SHIFT_WORKSPACE_NOT_FOUND', async () => {
    const store = newStore()

    const result = await store.confirmFreshPileStartPosition(fixtureShiftId('NEVER-INITIALIZED'), must(parsePileId('PILE-1')), {
      batchNumber: must(parseBatchNumber(1)),
      ritNumber: must(parseRitNumber(1)),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('E. a confirmed start position persists across close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const startPosition = { batchNumber: must(parseBatchNumber(1)), ritNumber: must(parseRitNumber(1)) }

    const firstStore = new LocalOperationalStore(databaseName)
    await firstStore.initializeShiftWorkspace({ shift, piles: [buildFixtureSapPile('PILE-1')], masterData, fleetSetup })
    await firstStore.confirmFreshPileStartPosition(fixtureShiftId('SHIFT-1'), must(parsePileId('PILE-1')), startPosition)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.find((pile) => pile.id === 'PILE-1')?.freshPileStartPosition).toEqual(startPosition)
    reopenedStore.close()
  })
})

describe('LocalOperationalStore — activateNewMasterPile (Phase 18 §6)', () => {
  function newPileArea() {
    return createPileAreaReference(
      must(parseSectorCode('S1')),
      must(parsePileAreaCode('STOCK-NEW')),
      must(parsePileId('PILE-NEW')),
      must(parseOreCode('SAP')),
    )
  }

  it('A. appends the Pile to workspace.piles and the PileArea to workspace.masterData.pileAreas atomically', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [], masterData, fleetSetup })

    const pileArea = newPileArea()
    const result = await store.activateNewMasterPile(
      fixtureShiftId('SHIFT-1'),
      buildFixtureSapPile('PILE-NEW'),
      pileArea,
    )
    expect(result.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-NEW'])
    expect(loaded.value?.masterData.pileAreas).toEqual([pileArea])
    store.close()
  })

  it('B. a duplicate PileId already active in the workspace is rejected, leaving piles and masterData unchanged', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    await store.initializeShiftWorkspace({ shift, piles: [buildFixtureSapPile('PILE-NEW')], masterData, fleetSetup })

    const result = await store.activateNewMasterPile(
      fixtureShiftId('SHIFT-1'),
      buildFixtureSapPile('PILE-NEW'),
      newPileArea(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE')

    const loaded = await store.loadCurrentShiftWorkspace()
    if (!loaded.ok) return
    expect(loaded.value?.piles.map((pile) => pile.id)).toEqual(['PILE-NEW'])
    expect(loaded.value?.masterData.pileAreas).toEqual([])
    store.close()
  })

  it('C. no workspace exists for the given ShiftId fails with SHIFT_WORKSPACE_NOT_FOUND', async () => {
    const store = newStore()

    const result = await store.activateNewMasterPile(
      fixtureShiftId('NEVER-INITIALIZED'),
      buildFixtureSapPile('PILE-NEW'),
      newPileArea(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('D. does not affect any pre-existing HaulageTransaction/SamplePosition reads for other piles', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile1 = buildFixtureSapPile('PILE-1')
    await store.initializeShiftWorkspace({ shift, piles: [pile1], masterData, fleetSetup })
    await store.addHaulageTransaction(
      buildFixtureHaulageTransaction({
        id: 'TXN-1',
        shiftId: 'SHIFT-1',
        pile: pile1,
        batch: 1,
        rit: 1,
        masterData,
        fleetSetup,
      }),
    )

    await store.activateNewMasterPile(fixtureShiftId('SHIFT-1'), buildFixtureSapPile('PILE-NEW'), newPileArea())

    const transactions = await store.listHaulageTransactionsForShiftPile(
      fixtureShiftId('SHIFT-1'),
      fixturePileId('PILE-1'),
    )
    if (!transactions.ok) return
    expect(transactions.value.map((transaction) => transaction.id)).toEqual(['TXN-1'])
    store.close()
  })
})

describe('LocalOperationalStore — atomic workspace initialization', () => {
  it('a failed re-initialization leaves the existing workspace and current pointer uncorrupted', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shiftA = buildFixtureShift('SHIFT-A')

    const initA = await store.initializeShiftWorkspace({
      shift: shiftA,
      piles: [buildFixtureSapPile('PILE-A1')],
      masterData,
      fleetSetup,
    })
    expect(initA.ok).toBe(true)

    const conflicting = await store.initializeShiftWorkspace({
      shift: shiftA,
      piles: [buildFixtureSapPile('PILE-DIFFERENT')],
      masterData,
      fleetSetup,
    })
    expect(conflicting.ok).toBe(false)
    if (conflicting.ok) return
    expect(conflicting.error.code).toBe('SHIFT_WORKSPACE_ALREADY_EXISTS')

    const current = await store.loadCurrentShiftWorkspace()
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(current.value?.shiftId).toBe('SHIFT-A')
    expect(current.value?.piles.map((pile) => pile.id)).toEqual(['PILE-A1'])
    store.close()
  })
})

describe('LocalOperationalStore — haulage transactions', () => {
  async function setupWorkspace(store: LocalOperationalStore, shiftIdValue: string, pileIdValues: string[]) {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift(shiftIdValue)
    const piles = pileIdValues.map((id) => buildFixtureSapPile(id))
    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    if (!initResult.ok) throw new Error('invalid test setup')
    return { masterData, fleetSetup, piles }
  }

  it('A. adding then reading a transaction by id preserves all fields', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-001',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
    })

    const addResult = await store.addHaulageTransaction(transaction)
    expect(addResult.ok).toBe(true)

    const getResult = await store.getHaulageTransaction(fixtureTransactionId('TX-001'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    expect(getResult.value).toEqual(transaction)
    store.close()
  })

  it('B. a WRONG_TRUCK transaction round-trips its truck/status/reasons unchanged after close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const store = new LocalOperationalStore(databaseName)
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-WRONG-TRUCK',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    expect(transaction.truckValidation.status).toBe('WRONG_TRUCK')
    expect(transaction.samplingEvaluation.sampleRequired).toBe(true)
    if (transaction.samplingEvaluation.sampleRequired) {
      expect(Number(transaction.samplingEvaluation.incrementNumber)).toBe(6)
    }

    const addResult = await store.addHaulageTransaction(transaction)
    expect(addResult.ok).toBe(true)
    store.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const getResult = await reopenedStore.getHaulageTransaction(fixtureTransactionId('TX-WRONG-TRUCK'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    const loadedTransaction = getResult.value
    expect(loadedTransaction?.truckId).toBe(FIXTURE_WRONG_TRUCK_TRUCK_ID)
    expect(loadedTransaction?.truckValidation.status).toBe('WRONG_TRUCK')
    if (loadedTransaction?.truckValidation.status === 'WRONG_TRUCK') {
      expect(loadedTransaction.truckValidation.reasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    }
    expect(loadedTransaction?.samplingEvaluation.sampleRequired).toBe(true)
    if (loadedTransaction?.samplingEvaluation.sampleRequired) {
      expect(Number(loadedTransaction.samplingEvaluation.incrementNumber)).toBe(6)
    }
    reopenedStore.close()
  })

  it('C. a sampled transaction round-trips sampleRequired/incrementNumber unchanged', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-SAMPLE',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
    })

    const addResult = await store.addHaulageTransaction(transaction)
    expect(addResult.ok).toBe(true)

    const getResult = await store.getHaulageTransaction(fixtureTransactionId('TX-SAMPLE'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    expect(getResult.value?.samplingEvaluation.sampleRequired).toBe(true)
    if (getResult.value?.samplingEvaluation.sampleRequired) {
      expect(Number(getResult.value.samplingEvaluation.incrementNumber)).toBe(6)
    }
    store.close()
  })

  it('D. adding the same HaulageTransactionId twice fails with DUPLICATE_HAULAGE_TRANSACTION_ID, keeping the original', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const original = buildFixtureHaulageTransaction({
      id: 'TX-001',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
    })
    const first = await store.addHaulageTransaction(original)
    expect(first.ok).toBe(true)

    const conflicting = buildFixtureHaulageTransaction({
      id: 'TX-001',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 14,
      masterData,
      fleetSetup,
    })
    const second = await store.addHaulageTransaction(conflicting)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('DUPLICATE_HAULAGE_TRANSACTION_ID')

    const getResult = await store.getHaulageTransaction(fixtureTransactionId('TX-001'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    expect(Number(getResult.value?.batchPosition.ritNumber)).toBe(12)
    store.close()
  })

  it('E. two different transaction ids may share the same BatchPosition', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const first = buildFixtureHaulageTransaction({
      id: 'TX-001',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
    })
    const second = buildFixtureHaulageTransaction({
      id: 'TX-002',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
    })

    const firstResult = await store.addHaulageTransaction(first)
    const secondResult = await store.addHaulageTransaction(second)
    expect(firstResult.ok).toBe(true)
    expect(secondResult.ok).toBe(true)
    store.close()
  })

  it('F. listHaulageTransactionsForShift returns only that shift’s transactions', async () => {
    const store = newStore()
    const shiftAContext = await setupWorkspace(store, 'SHIFT-A', ['PILE-A1'])
    const shiftBContext = await setupWorkspace(store, 'SHIFT-B', ['PILE-B1'])

    await store.addHaulageTransaction(
      buildFixtureHaulageTransaction({
        id: 'TX-A-1',
        shiftId: 'SHIFT-A',
        pile: shiftAContext.piles[0],
        batch: 24,
        rit: 2,
        masterData: shiftAContext.masterData,
        fleetSetup: shiftAContext.fleetSetup,
      }),
    )
    await store.addHaulageTransaction(
      buildFixtureHaulageTransaction({
        id: 'TX-B-1',
        shiftId: 'SHIFT-B',
        pile: shiftBContext.piles[0],
        batch: 24,
        rit: 2,
        masterData: shiftBContext.masterData,
        fleetSetup: shiftBContext.fleetSetup,
      }),
    )

    const shiftAResult = await store.listHaulageTransactionsForShift(fixtureShiftId('SHIFT-A'))
    expect(shiftAResult.ok).toBe(true)
    if (!shiftAResult.ok) return
    expect(shiftAResult.value.map((tx) => tx.id)).toEqual(['TX-A-1'])
    store.close()
  })

  it('G. listHaulageTransactionsForShiftPile returns only that shift/pile’s transactions', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1', 'PILE-2'])

    await store.addHaulageTransaction(
      buildFixtureHaulageTransaction({
        id: 'TX-P1-1',
        shiftId: 'SHIFT-1',
        pile: piles[0],
        batch: 24,
        rit: 2,
        masterData,
        fleetSetup,
      }),
    )
    await store.addHaulageTransaction(
      buildFixtureHaulageTransaction({
        id: 'TX-P2-1',
        shiftId: 'SHIFT-1',
        pile: piles[1],
        batch: 24,
        rit: 2,
        masterData,
        fleetSetup,
      }),
    )

    const pile1Result = await store.listHaulageTransactionsForShiftPile(
      fixtureShiftId('SHIFT-1'),
      fixturePileId('PILE-1'),
    )
    expect(pile1Result.ok).toBe(true)
    if (!pile1Result.ok) return
    expect(pile1Result.value.map((tx) => tx.id)).toEqual(['TX-P1-1'])
    store.close()
  })

  it('H. a transaction referencing a Shift without a workspace is rejected with SHIFT_WORKSPACE_NOT_FOUND', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-ORPHAN',
      shiftId: 'SHIFT-NEVER-INITIALIZED',
      pile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })

    const result = await store.addHaulageTransaction(transaction)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('I. a transaction whose pileId is not part of the shift workspace is rejected with PILE_NOT_IN_SHIFT_WORKSPACE', async () => {
    const store = newStore()
    const { masterData, fleetSetup } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const strangerPile = buildFixtureSapPile('PILE-NOT-IN-WORKSPACE')

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-ORPHAN-PILE',
      shiftId: 'SHIFT-1',
      pile: strangerPile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })

    const result = await store.addHaulageTransaction(transaction)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_NOT_IN_SHIFT_WORKSPACE')
    store.close()
  })

  it('J. mutating the original Wrong Truck reasons array afterward does not alter the stored transaction', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-WRONG-TRUCK',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    if (transaction.truckValidation.status !== 'WRONG_TRUCK') {
      throw new Error('invalid test fixture')
    }

    const addResult = await store.addHaulageTransaction(transaction)
    expect(addResult.ok).toBe(true)

    // Mutate the original nested reasons array through a test-only cast.
    ;(transaction.truckValidation.reasons as string[]).push('INJECTED_REASON')

    const getResult = await store.getHaulageTransaction(fixtureTransactionId('TX-WRONG-TRUCK'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    if (getResult.value?.truckValidation.status !== 'WRONG_TRUCK') {
      throw new Error('expected WRONG_TRUCK')
    }
    expect(getResult.value.truckValidation.reasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    store.close()
  })

  it('K. captures the Wrong Truck reasons array exactly as of invocation, immune to a caller mutation racing the pending write', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-RACE',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 12,
      masterData,
      fleetSetup,
      truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    if (transaction.truckValidation.status !== 'WRONG_TRUCK') {
      throw new Error('invalid test fixture')
    }

    const pending = store.addHaulageTransaction(transaction)

    // Mutate the original reasons array immediately, before the pending
    // write settles — this races the asynchronous
    // workspace/pile/duplicate integrity checks inside
    // addHaulageTransaction, not merely a mutation after it resolved.
    ;(transaction.truckValidation.reasons as string[]).push('INJECTED_REASON')

    const addResult = await pending
    expect(addResult.ok).toBe(true)

    const getResult = await store.getHaulageTransaction(fixtureTransactionId('TX-RACE'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    if (getResult.value?.truckValidation.status !== 'WRONG_TRUCK') {
      throw new Error('expected WRONG_TRUCK')
    }
    expect(getResult.value.truckValidation.reasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    store.close()
  })
})

describe('LocalOperationalStore — sample positions', () => {
  async function setupWorkspace(store: LocalOperationalStore, shiftIdValue: string, pileIdValues: string[]) {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift(shiftIdValue)
    const piles = pileIdValues.map((id) => buildFixtureSapPile(id))
    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    if (!initResult.ok) throw new Error('invalid test setup')
    return { masterData, fleetSetup, piles }
  }

  it('1-5. adding then listing a SamplePosition preserves every field exactly', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    const addResult = await store.addSamplePosition(position)
    expect(addResult.ok).toBe(true)

    const byId = await store.getSamplePosition(fixtureSamplePositionId('SP-1'))
    expect(byId.ok).toBe(true)
    if (!byId.ok) return
    expect(byId.value).toEqual(position)

    const byShift = await store.listSamplePositionsForShift(fixtureShiftId('SHIFT-1'))
    expect(byShift.ok).toBe(true)
    if (!byShift.ok) return
    expect(byShift.value).toEqual([position])

    const byShiftPile = await store.listSamplePositionsForShiftPile(fixtureShiftId('SHIFT-1'), fixturePileId('PILE-1'))
    expect(byShiftPile.ok).toBe(true)
    if (!byShiftPile.ok) return
    expect(byShiftPile.value).toEqual([position])
    store.close()
  })

  it('6. adding the same SamplePositionId twice fails with DUPLICATE_SAMPLE_POSITION_ID, keeping the original', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const original = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const first = await store.addSamplePosition(original)
    expect(first.ok).toBe(true)

    const conflicting = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 25,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const second = await store.addSamplePosition(conflicting)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('DUPLICATE_SAMPLE_POSITION_ID')

    const byId = await store.getSamplePosition(fixtureSamplePositionId('SP-1'))
    expect(byId.ok).toBe(true)
    if (!byId.ok) return
    expect(Number(byId.value?.batchNumber)).toBe(24)
    store.close()
  })

  it('7. a SamplePosition referencing a Shift without a workspace is rejected with SHIFT_WORKSPACE_NOT_FOUND', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('PILE-1')

    const position = buildFixtureSamplePosition({
      id: 'SP-ORPHAN',
      shiftId: 'SHIFT-NEVER-INITIALIZED',
      pile,
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    const result = await store.addSamplePosition(position)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('8. a SamplePosition whose pileId is not part of the shift workspace is rejected with PILE_NOT_IN_SHIFT_WORKSPACE', async () => {
    const store = newStore()
    const { masterData } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const strangerPile = buildFixtureSapPile('PILE-NOT-IN-WORKSPACE')

    const position = buildFixtureSamplePosition({
      id: 'SP-ORPHAN-PILE',
      shiftId: 'SHIFT-1',
      pile: strangerPile,
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    const result = await store.addSamplePosition(position)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_NOT_IN_SHIFT_WORKSPACE')
    store.close()
  })

  it('9. an overlapping SamplePosition for the same Shift/Pile/Batch is rejected atomically with SAMPLE_POSITION_OVERLAP', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const existing = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const firstAdd = await store.addSamplePosition(existing)
    expect(firstAdd.ok).toBe(true)

    const overlapping = buildFixtureSamplePosition({
      id: 'SP-2',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 8,
      ritTo: 20,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const secondAdd = await store.addSamplePosition(overlapping)
    expect(secondAdd.ok).toBe(false)
    if (secondAdd.ok) return
    expect(secondAdd.error.code).toBe('SAMPLE_POSITION_OVERLAP')

    const byShift = await store.listSamplePositionsForShift(fixtureShiftId('SHIFT-1'))
    expect(byShift.ok).toBe(true)
    if (!byShift.ok) return
    expect(byShift.value.map((p) => p.id)).toEqual(['SP-1'])
    store.close()
  })

  it('10. a non-overlapping range on the same Pile/Batch is accepted', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const first = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const second = buildFixtureSamplePosition({
      id: 'SP-2',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 11,
      ritTo: 20,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    expect((await store.addSamplePosition(first)).ok).toBe(true)
    expect((await store.addSamplePosition(second)).ok).toBe(true)
    store.close()
  })

  it('11. the same numeric range on a different Batch is accepted', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const first = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const second = buildFixtureSamplePosition({
      id: 'SP-2',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 25,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })

    expect((await store.addSamplePosition(first)).ok).toBe(true)
    expect((await store.addSamplePosition(second)).ok).toBe(true)
    store.close()
  })

  it('13. a SamplePosition survives close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const firstSession = new LocalOperationalStore(databaseName)
    const { masterData, piles } = await setupWorkspace(firstSession, 'SHIFT-1', ['PILE-1'])

    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect((await firstSession.addSamplePosition(position)).ok).toBe(true)
    firstSession.close()

    const reopenedSession = new LocalOperationalStore(databaseName)
    const reopened = await reopenedSession.getSamplePosition(fixtureSamplePositionId('SP-1'))
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.value).toEqual(position)
    reopenedSession.close()
  })

  it('a DELIVERED SamplePosition with a dispatcher round-trips unchanged', async () => {
    const store = newStore()
    const { masterData, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])

    const destination = parseDeliveryDestinationCode('LAB-A')
    if (!destination.ok) throw new Error('invalid test fixture')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: createDeliveredDelivery(destination.value, fixtureEmployeeId(FIXTURE_EMPLOYEE_ID)),
    })
    expect((await store.addSamplePosition(position)).ok).toBe(true)

    const byId = await store.getSamplePosition(fixtureSamplePositionId('SP-1'))
    expect(byId.ok).toBe(true)
    if (!byId.ok) return
    expect(byId.value?.delivery).toEqual({
      status: 'DELIVERED',
      destination: 'LAB-A',
      dispatcherEmployeeId: FIXTURE_EMPLOYEE_ID,
    })
    store.close()
  })
})

describe('LocalOperationalStore — production records', () => {
  async function setupWorkspace(store: LocalOperationalStore, shiftIdValue: string, pileIdValues: string[]) {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift(shiftIdValue)
    const piles = pileIdValues.map((id) => buildFixtureSapPile(id))
    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    if (!initResult.ok) throw new Error('invalid test setup')
    return { masterData, fleetSetup, piles }
  }

  it('A. adding then reading a ProductionRecord by id preserves every field', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    expect((await store.addHaulageTransaction(transaction)).ok).toBe(true)

    const productionRecord = buildFixtureProductionRecord({ transaction })
    const addResult = await store.addProductionRecord(productionRecord)
    expect(addResult.ok).toBe(true)

    const getResult = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    expect(getResult.value).toEqual(productionRecord)
    store.close()
  })

  it('B. a ProductionRecord survives close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const firstSession = new LocalOperationalStore(databaseName)
    const { masterData, fleetSetup, piles } = await setupWorkspace(firstSession, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    expect((await firstSession.addHaulageTransaction(transaction)).ok).toBe(true)
    const productionRecord = buildFixtureProductionRecord({ transaction })
    expect((await firstSession.addProductionRecord(productionRecord)).ok).toBe(true)
    firstSession.close()

    const reopenedSession = new LocalOperationalStore(databaseName)
    const reopened = await reopenedSession.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.value).toEqual(productionRecord)
    reopenedSession.close()
  })

  it('C. listProductionRecordsForShift returns only that shift’s records', async () => {
    const store = newStore()
    const shiftAContext = await setupWorkspace(store, 'SHIFT-A', ['PILE-A1'])
    const shiftBContext = await setupWorkspace(store, 'SHIFT-B', ['PILE-B1'])

    const txA = buildFixtureHaulageTransaction({
      id: 'TX-A-1',
      shiftId: 'SHIFT-A',
      pile: shiftAContext.piles[0],
      batch: 24,
      rit: 2,
      masterData: shiftAContext.masterData,
      fleetSetup: shiftAContext.fleetSetup,
    })
    const txB = buildFixtureHaulageTransaction({
      id: 'TX-B-1',
      shiftId: 'SHIFT-B',
      pile: shiftBContext.piles[0],
      batch: 24,
      rit: 2,
      masterData: shiftBContext.masterData,
      fleetSetup: shiftBContext.fleetSetup,
    })
    await store.addHaulageTransaction(txA)
    await store.addHaulageTransaction(txB)
    await store.addProductionRecord(buildFixtureProductionRecord({ transaction: txA }))
    await store.addProductionRecord(buildFixtureProductionRecord({ transaction: txB }))

    const shiftAResult = await store.listProductionRecordsForShift(fixtureShiftId('SHIFT-A'))
    expect(shiftAResult.ok).toBe(true)
    if (!shiftAResult.ok) return
    expect(shiftAResult.value.map((record) => record.transaction.id)).toEqual(['TX-A-1'])
    store.close()
  })

  it('D. listProductionRecordsForShiftPile returns only that shift/pile’s records', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1', 'PILE-2'])

    const tx1 = buildFixtureHaulageTransaction({
      id: 'TX-P1-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const tx2 = buildFixtureHaulageTransaction({
      id: 'TX-P2-1',
      shiftId: 'SHIFT-1',
      pile: piles[1],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    await store.addHaulageTransaction(tx1)
    await store.addHaulageTransaction(tx2)
    await store.addProductionRecord(buildFixtureProductionRecord({ transaction: tx1 }))
    await store.addProductionRecord(buildFixtureProductionRecord({ transaction: tx2 }))

    const pile1Result = await store.listProductionRecordsForShiftPile(
      fixtureShiftId('SHIFT-1'),
      fixturePileId('PILE-1'),
    )
    expect(pile1Result.ok).toBe(true)
    if (!pile1Result.ok) return
    expect(pile1Result.value.map((record) => record.transaction.id)).toEqual(['TX-P1-1'])
    store.close()
  })

  it('E. adding the same ProductionRecord twice fails with DUPLICATE_PRODUCTION_RECORD_ID, keeping the original', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    expect((await store.addHaulageTransaction(transaction)).ok).toBe(true)

    const first = await store.addProductionRecord(buildFixtureProductionRecord({ transaction, remark: 'first' }))
    expect(first.ok).toBe(true)

    const second = await store.addProductionRecord(buildFixtureProductionRecord({ transaction, remark: 'second' }))
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('DUPLICATE_PRODUCTION_RECORD_ID')

    const getResult = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(getResult.ok).toBe(true)
    if (!getResult.ok) return
    expect(getResult.value?.effective.remark).toBe('first')
    store.close()
  })

  it('F. a ProductionRecord referencing a HaulageTransaction that was never added is rejected with HAULAGE_TRANSACTION_NOT_FOUND', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-ORPHAN',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })

    const result = await store.addProductionRecord(buildFixtureProductionRecord({ transaction }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HAULAGE_TRANSACTION_NOT_FOUND')
    store.close()
  })
})

describe('LocalOperationalStore — addProductionTransaction (atomic pair save)', () => {
  async function setupWorkspace(store: LocalOperationalStore, shiftIdValue: string, pileIdValues: string[]) {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift(shiftIdValue)
    const piles = pileIdValues.map((id) => buildFixtureSapPile(id))
    const initResult = await store.initializeShiftWorkspace({ shift, piles, masterData, fleetSetup })
    if (!initResult.ok) throw new Error('invalid test setup')
    return { masterData, fleetSetup, piles }
  }

  it('A. saves the HaulageTransaction and ProductionRecord together, both readable afterward', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const productionRecord = buildFixtureProductionRecord({ transaction })

    const result = await store.addProductionTransaction({ transaction, productionRecord })
    expect(result.ok).toBe(true)

    const storedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-1'))
    expect(storedTransaction.ok).toBe(true)
    if (!storedTransaction.ok) return
    expect(storedTransaction.value).toEqual(transaction)

    const storedRecord = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(storedRecord.ok).toBe(true)
    if (!storedRecord.ok) return
    expect(storedRecord.value).toEqual(productionRecord)
    store.close()
  })

  it('B. a ProductionRecord.transaction that does not match the given transaction is rejected, nothing persisted', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const otherTransaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 4,
      masterData,
      fleetSetup,
    })
    const mismatchedRecord = buildFixtureProductionRecord({ transaction: otherTransaction })

    const result = await store.addProductionTransaction({ transaction, productionRecord: mismatchedRecord })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_TRANSACTION_MISMATCH')

    expect((await store.getHaulageTransaction(fixtureTransactionId('TX-1'))).ok).toBe(true)
    const storedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-1'))
    if (storedTransaction.ok) expect(storedTransaction.value).toBeUndefined()
    const storedRecord = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    if (storedRecord.ok) expect(storedRecord.value).toBeUndefined()
    store.close()
  })

  it('C. a repeated Transaction_ID is rejected, keeping the original pair untouched', async () => {
    const store = newStore()
    const { masterData, fleetSetup, piles } = await setupWorkspace(store, 'SHIFT-1', ['PILE-1'])
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const productionRecord = buildFixtureProductionRecord({ transaction, remark: 'first' })
    expect((await store.addProductionTransaction({ transaction, productionRecord })).ok).toBe(true)

    const secondRecord = buildFixtureProductionRecord({ transaction, remark: 'second' })
    const second = await store.addProductionTransaction({ transaction, productionRecord: secondRecord })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('DUPLICATE_HAULAGE_TRANSACTION_ID')

    const storedRecord = await store.getProductionRecord(fixtureTransactionId('TX-1'))
    expect(storedRecord.ok).toBe(true)
    if (!storedRecord.ok) return
    expect(storedRecord.value?.effective.remark).toBe('first')
    store.close()
  })

  it('D. a save rejected for referential-integrity reasons persists neither row', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-NONE')
    // 'SHIFT-NONE' is never initialized on this store — a genuine orphan.
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-ORPHAN',
      shiftId: 'SHIFT-NONE',
      pile,
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const productionRecord = buildFixtureProductionRecord({ transaction })

    const result = await store.addProductionTransaction({ transaction, productionRecord })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')

    const storedTransaction = await store.getHaulageTransaction(fixtureTransactionId('TX-ORPHAN'))
    if (storedTransaction.ok) expect(storedTransaction.value).toBeUndefined()
    const storedRecord = await store.getProductionRecord(fixtureTransactionId('TX-ORPHAN'))
    if (storedRecord.ok) expect(storedRecord.value).toBeUndefined()
    store.close()
  })

  it('E. an ACCEPT and a REJECT pair each survive close/reopen of the same database', async () => {
    const databaseName = uniqueDatabaseName()
    const firstSession = new LocalOperationalStore(databaseName)
    const { masterData, fleetSetup, piles } = await setupWorkspace(firstSession, 'SHIFT-1', ['PILE-1'])
    const acceptTransaction = buildFixtureHaulageTransaction({
      id: 'TX-ACCEPT',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const rejectTransaction = buildFixtureHaulageTransaction({
      id: 'TX-REJECT',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 24,
      rit: 3,
      masterData,
      fleetSetup,
    })
    const acceptRecord = buildFixtureProductionRecord({ transaction: acceptTransaction, disposition: 'ACCEPT' })
    const rejectRecord = buildFixtureProductionRecord({ transaction: rejectTransaction, disposition: 'REJECT' })
    expect((await firstSession.addProductionTransaction({ transaction: acceptTransaction, productionRecord: acceptRecord })).ok).toBe(true)
    expect((await firstSession.addProductionTransaction({ transaction: rejectTransaction, productionRecord: rejectRecord })).ok).toBe(true)
    firstSession.close()

    const reopenedSession = new LocalOperationalStore(databaseName)
    const reopenedAccept = await reopenedSession.getProductionRecord(fixtureTransactionId('TX-ACCEPT'))
    const reopenedReject = await reopenedSession.getProductionRecord(fixtureTransactionId('TX-REJECT'))
    expect(reopenedAccept.ok).toBe(true)
    expect(reopenedReject.ok).toBe(true)
    if (!reopenedAccept.ok || !reopenedReject.ok) return
    expect(reopenedAccept.value?.effective.disposition).toBe('ACCEPT')
    expect(reopenedReject.value?.effective.disposition).toBe('REJECT')
    reopenedSession.close()
  })
})
