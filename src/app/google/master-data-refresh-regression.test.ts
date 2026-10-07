import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clock } from '@/application/common/clock'
import { localOperationalStore } from '@/app/local-operational-store'
import type { MasterDataCacheEntry } from '@/application/google/google-ports'
import { err, ok } from '@/domain/common/result'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureShiftId,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { LocalOperationalStore } from '@/infrastructure/local-db/local-operational-store'
import { AppsScriptMasterDataRemoteReader } from '@/integrations/google/apps-script-master-data-remote-reader'
import {
  refreshAppsScriptMasterData,
  subscribeToMasterDataRefreshed,
} from './google-master-data-sync'
import { clearMasterDataDiagnostics, readMasterDataDiagnostics } from './master-data-diagnostics'

/**
 * End-to-end regression for the production master-data path:
 * JSONP script → callback → payload shape → `parseMasterDataFromRanges`
 * → IndexedDB cache. Only the network is simulated; the reader, parser,
 * use case and Dexie store (on fake-indexeddb) are the real ones.
 */

const PERSON_ID = 'SCM0268'
const PERSON_NAME = 'Mega Putri'

const validTables = {
  Employees: [
    ['Employee_ID', 'Name', 'Initial', 'Level'],
    [PERSON_ID, PERSON_NAME, 'Mega', 'Supervisor'],
  ],
  Crews: [
    ['Crew_ID', 'Name', 'Job'],
    ['CREW-A', 'Crew A', 'Sampler'],
  ],
  Sectors: [['Sector_Code'], ['BR1']],
  Sampling_Houses: [
    ['Sector_Code', 'Sampling_House_Code'],
    ['BR1', 'SH1'],
  ],
  Pile_Areas: [['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore']],
  Haulers: [['Hauler_Code', 'Name']],
  Trucks: [['Truck_ID', 'Hauler_Code']],
  Ore_Sampling_Config: [['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing']],
}

/** Mirrors the production sheet observed on 2026-10-07: trailing Crews rows with a Name but no Crew_ID. */
const crewsWithNameOnlyRows = {
  ...validTables,
  Crews: [
    ['Crew_ID', 'Name', 'Job'],
    ['CREW-A', 'Crew A', 'Sampler'],
    ['', PERSON_NAME, ''],
  ],
}

const clock: Clock = { now: () => new Date('2026-10-07T00:00:00.000Z') }
const createdDatabases: string[] = []
let warn: ReturnType<typeof vi.spyOn>

function newStore(): LocalOperationalStore {
  const name = `master-data-refresh-regression-${createdDatabases.length}-${Math.random().toString(36).slice(2)}`
  createdDatabases.push(name)
  return new LocalOperationalStore(name)
}

function pendingScripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll<HTMLScriptElement>('script[src]')]
}

/** Simulates the browser executing `callback(payload)` from the script.googleusercontent.com echo response. */
function respond(script: HTMLScriptElement, tables: unknown): void {
  const name = new URL(script.src).searchParams.get('callback') ?? ''
  const callback = (window as unknown as Record<string, unknown>)[name]
  if (typeof callback !== 'function') throw new Error('JSONP callback is no longer registered')
  callback({ tables })
}

function refresh(store: LocalOperationalStore) {
  return refreshAppsScriptMasterData({
    reader: new AppsScriptMasterDataRemoteReader('https://example.test/exec'),
    cache: store,
    clock,
  })
}

beforeEach(() => {
  clearMasterDataDiagnostics()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  vi.useRealTimers()
  // Settle (not just remove) leftover requests so no shared flight leaks into the next test.
  pendingScripts().forEach((script) => script.dispatchEvent(new Event('error')))
  await new Promise((resolve) => setTimeout(resolve, 0))
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(createdDatabases.splice(0).map((name) => Dexie.delete(name)))
})

describe('master-data refresh pipeline — regression', () => {
  it('1. loads a valid remote payload into the IndexedDB cache', async () => {
    const store = newStore()
    const pending = refresh(store)
    respond(pendingScripts()[0], validTables)

    await expect(pending).resolves.toMatchObject({ ok: true })
    const cached = await store.readCachedMasterData()
    expect(cached.ok && cached.value?.masterData.employees).toEqual([
      { id: PERSON_ID, name: PERSON_NAME, level: 'Supervisor' },
    ])
    expect(readMasterDataDiagnostics()).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('2. a delivered (HTTP 200) callback with invalid master data fails validation and keeps the failed table/row', async () => {
    const store = newStore()
    const pending = refresh(store)
    respond(pendingScripts()[0], crewsWithNameOnlyRows)

    const result = await pending
    expect(result).toMatchObject({ ok: false, error: { code: 'MASTER_DATA_REMOTE_INVALID' } })
    expect(readMasterDataDiagnostics()).toEqual([
      expect.objectContaining({
        stage: 'REMOTE_VALIDATION',
        code: 'MASTER_DATA_REMOTE_INVALID',
        causeCode: 'GOOGLE_MASTER_ROW_INVALID/GOOGLE_MASTER_REQUIRED_CELL_MISSING',
        table: 'Crews',
        rowNumber: 3,
      }),
    ])
    const cached = await store.readCachedMasterData()
    expect(cached).toEqual({ ok: true, value: undefined })
  })

  it('2b. identifies a header failure by table without echoing sheet content', async () => {
    const pending = refresh(newStore())
    respond(pendingScripts()[0], { ...validTables, Trucks: [['Truck', 'Hauler_Code']] })

    await pending
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'REMOTE_VALIDATION',
      causeCode: 'GOOGLE_MASTER_REQUIRED_HEADER_MISSING',
      table: 'Trucks',
    })
  })

  it('2c. identifies a missing payload table as a payload-shape failure', async () => {
    const pending = refresh(newStore())
    respond(pendingScripts()[0], { ...validTables, Haulers: undefined })

    await pending
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'REMOTE_PAYLOAD',
      causeCode: 'MASTER_DATA_PAYLOAD_SHAPE_INVALID',
      table: 'Haulers',
    })
  })

  it('diagnostics never contain names, IDs, cell values or the domain message (which here echoes the duplicate ID)', async () => {
    const pending = refresh(newStore())
    respond(pendingScripts()[0], {
      ...validTables,
      Employees: [...validTables.Employees, [PERSON_ID, PERSON_NAME, 'Mega', 'Supervisor']],
    })
    const result = await pending
    if (result.ok) throw new Error('expected duplicate employees to fail')

    const logged = JSON.stringify([readMasterDataDiagnostics(), warn.mock.calls])
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'REMOTE_VALIDATION',
      causeCode: expect.stringMatching(/DUPLICATE/),
    })
    for (const secret of [PERSON_ID, PERSON_NAME, 'Mega', 'Duplicate'])
      expect(logged).not.toContain(secret)
  })

  it('3. reports a JSONP timeout as APPS_SCRIPT_TIMEOUT at the request stage', async () => {
    vi.useFakeTimers()
    const pending = refresh(newStore())
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_TIMEOUT' },
    })
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'REMOTE_REQUEST',
      code: 'APPS_SCRIPT_TIMEOUT',
    })
  })

  it('3b. a response arriving after the 15s timeout is discarded: the network shows 200, the app reports a timeout', async () => {
    vi.useFakeTimers()
    const store = newStore()
    const pending = refresh(store)
    const script = pendingScripts()[0]
    const callbackName = new URL(script.src).searchParams.get('callback') ?? ''
    await vi.advanceTimersByTimeAsync(15_000)

    expect((window as unknown as Record<string, unknown>)[callbackName]).toBeUndefined()
    expect(() => respond(script, validTables)).toThrow('no longer registered')
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_TIMEOUT' },
    })
    vi.useRealTimers()
    expect(await store.readCachedMasterData()).toEqual({ ok: true, value: undefined })
  })

  it('4. reports a JSONP script load failure as APPS_SCRIPT_UNAVAILABLE', async () => {
    const pending = refresh(newStore())
    pendingScripts()[0].dispatchEvent(new Event('error'))

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_UNAVAILABLE' },
    })
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'REMOTE_REQUEST',
      code: 'APPS_SCRIPT_UNAVAILABLE',
    })
  })

  it('reports a missing endpoint as GOOGLE_CONFIG_UNAVAILABLE at the config stage', async () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', '  ')

    await expect(refreshAppsScriptMasterData({ cache: newStore(), clock })).resolves.toMatchObject({
      ok: false,
      error: { code: 'GOOGLE_CONFIG_UNAVAILABLE' },
    })
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'CONFIG',
      code: 'GOOGLE_CONFIG_UNAVAILABLE',
    })
    expect(pendingScripts()).toHaveLength(0)
  })

  it('5. reports an IndexedDB cache-write failure at the CACHE_WRITE stage after valid remote data', async () => {
    const store = newStore()
    vi.spyOn(store, 'replaceMasterDataCache').mockResolvedValue(
      err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'QuotaExceededError' }),
    )
    const pending = refresh(store)
    respond(pendingScripts()[0], validTables)

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'LOCAL_DATABASE_OPERATION_FAILED' },
    })
    expect(readMasterDataDiagnostics()[0]).toMatchObject({
      stage: 'CACHE_WRITE',
      code: 'LOCAL_DATABASE_OPERATION_FAILED',
    })
    expect(JSON.stringify(readMasterDataDiagnostics())).not.toContain('QuotaExceededError')
  })

  it('6. calls with test overrides stay isolated: they never join each other or a shared request', async () => {
    const store = newStore()
    const first = refresh(store)
    const second = refresh(store)
    const [firstScript, secondScript] = pendingScripts()

    expect(pendingScripts()).toHaveLength(2)
    secondScript.dispatchEvent(new Event('error'))
    respond(firstScript, validTables)

    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_UNAVAILABLE' },
    })
  })

  it('7. a failed refresh followed by a successful one populates the cache', async () => {
    const store = newStore()
    const failed = refresh(store)
    respond(pendingScripts()[0], crewsWithNameOnlyRows)
    await expect(failed).resolves.toMatchObject({ ok: false })

    const succeeded = refresh(store)
    respond(pendingScripts()[0], validTables)
    await expect(succeeded).resolves.toMatchObject({ ok: true })

    const cached = await store.readCachedMasterData()
    expect(cached.ok && cached.value?.masterData.crews).toEqual([
      { code: 'CREW-A', name: 'Crew A', jobCode: 'Sampler' },
    ])
  })

  it('8. an invalid, timed-out or failed refresh never replaces the previous valid cache', async () => {
    const store = newStore()
    const seeded = refresh(store)
    respond(pendingScripts()[0], validTables)
    const seededResult = await seeded
    if (!seededResult.ok) throw new Error('seed failed')
    const before = await store.readCachedMasterData()

    const invalid = refresh(store)
    respond(pendingScripts()[0], crewsWithNameOnlyRows)
    await expect(invalid).resolves.toMatchObject({
      ok: false,
      error: { code: 'MASTER_DATA_REMOTE_INVALID' },
    })

    const unavailable = refresh(store)
    pendingScripts()[0].dispatchEvent(new Event('error'))
    await expect(unavailable).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_UNAVAILABLE' },
    })

    expect(await store.readCachedMasterData()).toEqual(before)
  })
})

/**
 * The production path (no overrides): single-flight against the app-wide
 * `localOperationalStore`, whose cache methods are replaced in memory so
 * writes can be counted.
 */
describe('master-data refresh — shared production request', () => {
  let cache: MasterDataCacheEntry | undefined
  let replaceCache: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    cache = undefined
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', 'https://example.test/exec')
    vi.spyOn(localOperationalStore, 'readCachedMasterData').mockImplementation(async () =>
      ok(cache),
    )
    replaceCache = vi
      .spyOn(localOperationalStore, 'replaceMasterDataCache')
      .mockImplementation(async (masterData, fetchedAt) => {
        cache = { masterData, fetchedAt }
        return ok(undefined)
      })
  })

  it('two simultaneous callers share one JSONP request, one Promise, one result and one cache write', async () => {
    const first = refreshAppsScriptMasterData()
    const second = refreshAppsScriptMasterData()

    expect(second).toBe(first)
    expect(pendingScripts()).toHaveLength(1)
    respond(pendingScripts()[0], validTables)

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(a).toMatchObject({ ok: true })
    expect(replaceCache).toHaveBeenCalledTimes(1)
  })

  it('a shared failure is reported once, counts joined callers, and a later call starts a fresh request', async () => {
    const first = refreshAppsScriptMasterData()
    const second = refreshAppsScriptMasterData()
    pendingScripts()[0].dispatchEvent(new Event('error'))
    await expect(first).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_UNAVAILABLE' },
    })
    await expect(second).resolves.toMatchObject({
      ok: false,
      error: { code: 'APPS_SCRIPT_UNAVAILABLE' },
    })
    expect(readMasterDataDiagnostics()).toEqual([
      expect.objectContaining({
        stage: 'REMOTE_REQUEST',
        code: 'APPS_SCRIPT_UNAVAILABLE',
        joinedCallers: 1,
      }),
    ])

    const retry = refreshAppsScriptMasterData()
    expect(retry).not.toBe(first)
    expect(pendingScripts()).toHaveLength(1)
    respond(pendingScripts()[0], validTables)
    await expect(retry).resolves.toMatchObject({ ok: true })
    expect(replaceCache).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers after a successful shared refresh, but not after a failed one', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToMasterDataRefreshed(listener)

    const failed = refreshAppsScriptMasterData()
    pendingScripts()[0].dispatchEvent(new Event('error'))
    await failed
    expect(listener).not.toHaveBeenCalled()

    const succeeded = refreshAppsScriptMasterData()
    respond(pendingScripts()[0], validTables)
    await succeeded
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    const afterUnsubscribe = refreshAppsScriptMasterData()
    respond(pendingScripts()[0], validTables)
    await afterUnsubscribe
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('an unexpected rejection does not block future refreshes', async () => {
    replaceCache.mockRejectedValueOnce(new Error('unexpected'))
    const broken = refreshAppsScriptMasterData()
    respond(pendingScripts()[0], validTables)
    await expect(broken).rejects.toThrow('unexpected')

    const next = refreshAppsScriptMasterData()
    expect(pendingScripts()).toHaveLength(1)
    respond(pendingScripts()[0], validTables)
    await expect(next).resolves.toMatchObject({ ok: true })
  })
})

describe('master-data refresh — local operational data is protected', () => {
  it('neither a failed nor a successful refresh touches the active workspace, its master-data snapshot or its transactions', async () => {
    const store = newStore()
    const workspaceMasterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(workspaceMasterData)
    const piles = [buildFixtureSapPile('PILE-1')]
    expect(
      (
        await store.initializeShiftWorkspace({
          shift: buildFixtureShift('SHIFT-1'),
          piles,
          masterData: workspaceMasterData,
          fleetSetup,
        })
      ).ok,
    ).toBe(true)
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1',
      shiftId: 'SHIFT-1',
      pile: piles[0],
      batch: 1,
      rit: 1,
      masterData: workspaceMasterData,
      fleetSetup,
    })
    expect((await store.addHaulageTransaction(transaction)).ok).toBe(true)
    const workspaceBefore = await store.loadShiftWorkspace(fixtureShiftId('SHIFT-1'))
    const transactionsBefore = await store.listHaulageTransactionsForShift(
      fixtureShiftId('SHIFT-1'),
    )

    const failed = refresh(store)
    respond(pendingScripts()[0], crewsWithNameOnlyRows)
    await expect(failed).resolves.toMatchObject({ ok: false })
    const succeeded = refresh(store)
    respond(pendingScripts()[0], validTables)
    await expect(succeeded).resolves.toMatchObject({ ok: true })

    expect(await store.loadShiftWorkspace(fixtureShiftId('SHIFT-1'))).toEqual(workspaceBefore)
    expect(await store.listHaulageTransactionsForShift(fixtureShiftId('SHIFT-1'))).toEqual(
      transactionsBefore,
    )
    const cached = await store.readCachedMasterData()
    expect(cached.ok && cached.value?.masterData.sectors).toEqual([{ code: 'BR1' }])
  })
})
