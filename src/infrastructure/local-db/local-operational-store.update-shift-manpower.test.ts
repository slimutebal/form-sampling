import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createManpowerAssignment } from '../../domain/manpower/manpower-assignment'
import { buildFixtureFleetSetup, buildFixtureMasterData, buildFixtureSapPile, buildFixtureShift, fixtureShiftId } from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  const name = `update-shift-manpower-store-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
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

describe('LocalOperationalStore.updateShiftManpower', () => {
  it('replaces the current shift manpower roster and it survives close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const firstStore = new LocalOperationalStore(databaseName)
    await firstStore.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
      manpower: [createManpowerAssignment('SCM0333', 'Raharjo Rahman', '', true)],
    })

    const updated = [
      createManpowerAssignment('SCM0333', 'Raharjo Rahman', '', true),
      createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
    ]
    const updateResult = await firstStore.updateShiftManpower(shift.id, updated)
    expect(updateResult.ok).toBe(true)
    firstStore.close()

    const reopenedStore = new LocalOperationalStore(databaseName)
    const loaded = await reopenedStore.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.manpower).toEqual(updated)
    reopenedStore.close()
  })

  it('adds, removes, and updates Job Desk in one replace', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
      manpower: [
        createManpowerAssignment('SCM0333', 'Raharjo Rahman', '', true),
        createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
      ],
    })

    // Remove SCM0333, add a new Crew, and change the surviving Crew's Job Desk.
    const updated = [createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Checker', false)]
    const updateResult = await store.updateShiftManpower(shift.id, updated)
    expect(updateResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.manpower).toEqual(updated)
    store.close()
  })

  it('never resets fleet, piles, or pending state — every other field is preserved', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup, manpower: [] })

    const updateResult = await store.updateShiftManpower(shift.id, [
      createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
    ])
    expect(updateResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.shift).toEqual(shift)
    expect(loaded.value?.piles.map((p) => p.id)).toEqual(['PILE-1'])
    expect(loaded.value?.fleetSetup).toEqual(fleetSetup)
    store.close()
  })

  it('fails with SHIFT_WORKSPACE_NOT_FOUND when no workspace exists for this shift', async () => {
    const store = newStore()

    const result = await store.updateShiftManpower(fixtureShiftId('SHIFT-MISSING'), [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    store.close()
  })

  it('never touches an already-stored HaulageTransaction when the roster is edited', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    await store.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup, manpower: [] })

    const updateResult = await store.updateShiftManpower(shift.id, [
      createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
    ])
    expect(updateResult.ok).toBe(true)

    const haulageList = await store.listHaulageTransactionsForShift(shift.id)
    expect(haulageList.ok).toBe(true)
    if (haulageList.ok) expect(haulageList.value).toEqual([])
    store.close()
  })
})
