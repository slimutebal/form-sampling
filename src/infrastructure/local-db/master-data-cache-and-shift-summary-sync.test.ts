import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '../../domain/common/codes'
import { parseShiftDate } from '../../domain/common/shift-date'
import type { Result } from '../../domain/common/result'
import { buildFixtureFleetSetup, buildFixtureMasterData, buildFixtureShift, fixtureShiftId } from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'
import type { ShiftSummarySnapshot, ShiftSummarySyncRecord } from './records'

let dbNameCounter = 0
const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  dbNameCounter += 1
  return `master-data-cache-and-outbox-test-${Date.now()}-${dbNameCounter}-${Math.random().toString(36).slice(2)}`
}

function newStore(): LocalOperationalStore {
  const name = uniqueDatabaseName()
  createdDatabaseNames.push(name)
  return new LocalOperationalStore(name)
}

afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${result.error.code}`)
  return result.value
}

function fixtureSummary(shiftIdValue: string, overrides: Partial<ShiftSummarySnapshot> = {}): ShiftSummarySnapshot {
  return {
    shiftId: fixtureShiftId(shiftIdValue),
    date: must(parseShiftDate('2026-09-04')),
    shiftCode: must(parseShiftCode('D')),
    sectorCode: must(parseSectorCode('S1')),
    samplingHouseCode: must(parseSamplingHouseCode('HOUSE-1')),
    ritTotal: 3,
    batchTotal: 1,
    incrementTotal: 3,
    wrongTruckTotal: 1,
    ...overrides,
  }
}

describe('LocalOperationalStore — master data cache (Phase 16 §6/§7)', () => {
  it('reading the cache on a fresh database returns ok(undefined)', async () => {
    const store = newStore()
    const result = await store.readCachedMasterData()
    expect(result).toEqual({ ok: true, value: undefined })
    store.close()
  })

  it('a successful replace can be read back with the injected fetchedAt', async () => {
    const store = newStore()
    const masterData = buildFixtureMasterData()
    const fetchedAt = new Date('2026-09-04T10:00:00.000Z')

    const replaceResult = await store.replaceMasterDataCache(masterData, fetchedAt)
    expect(replaceResult.ok).toBe(true)

    const readResult = await store.readCachedMasterData()
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.value?.masterData).toEqual(masterData)
    expect(readResult.value?.fetchedAt).toEqual(fetchedAt)
    store.close()
  })

  it('a second replace overwrites the single cached snapshot rather than adding a second row', async () => {
    const store = newStore()
    const first = buildFixtureMasterData()
    const second = buildFixtureMasterData()

    await store.replaceMasterDataCache(first, new Date('2026-09-01T00:00:00.000Z'))
    await store.replaceMasterDataCache(second, new Date('2026-09-04T00:00:00.000Z'))

    const readResult = await store.readCachedMasterData()
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.value?.fetchedAt).toEqual(new Date('2026-09-04T00:00:00.000Z'))
    store.close()
  })

  it('does not touch an active shift workspace masterData snapshot when the cache is replaced', async () => {
    const store = newStore()
    const workspaceMasterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(workspaceMasterData)
    const shift = buildFixtureShift('SHIFT-1')

    const initResult = await store.initializeShiftWorkspace({
      shift,
      piles: [],
      masterData: workspaceMasterData,
      fleetSetup,
    })
    expect(initResult.ok).toBe(true)

    const differentMasterData = buildFixtureMasterData()
    await store.replaceMasterDataCache(differentMasterData, new Date('2026-09-04T00:00:00.000Z'))

    const workspaceResult = await store.loadShiftWorkspace(fixtureShiftId('SHIFT-1'))
    expect(workspaceResult.ok).toBe(true)
    if (!workspaceResult.ok) return
    expect(workspaceResult.value?.masterData).toEqual(workspaceMasterData)

    const cacheResult = await store.readCachedMasterData()
    expect(cacheResult.ok).toBe(true)
    if (!cacheResult.ok) return
    expect(cacheResult.value?.masterData).toEqual(differentMasterData)
    store.close()
  })
})

describe('LocalOperationalStore — shift summary sync outbox (Phase 16 §10/§12)', () => {
  it('reading an outbox row that was never queued returns ok(undefined)', async () => {
    const store = newStore()
    const result = await store.getShiftSummarySyncRecord(fixtureShiftId('SHIFT-1'))
    expect(result).toEqual({ ok: true, value: undefined })
    store.close()
  })

  it('upserts and reads back a queued record', async () => {
    const store = newStore()
    const record: ShiftSummarySyncRecord = {
      shiftId: fixtureShiftId('SHIFT-1'),
      summary: fixtureSummary('SHIFT-1'),
      status: 'PENDING',
      attemptCount: 0,
      updatedAt: new Date('2026-09-04T10:00:00.000Z'),
    }

    const upsertResult = await store.upsertShiftSummarySyncRecord(record)
    expect(upsertResult.ok).toBe(true)

    const readResult = await store.getShiftSummarySyncRecord(fixtureShiftId('SHIFT-1'))
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.value).toEqual(record)
    store.close()
  })

  it('a second upsert for the same shiftId replaces the row rather than adding a duplicate', async () => {
    const store = newStore()
    await store.upsertShiftSummarySyncRecord({
      shiftId: fixtureShiftId('SHIFT-1'),
      summary: fixtureSummary('SHIFT-1', { ritTotal: 3 }),
      status: 'PENDING',
      attemptCount: 0,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    })
    await store.upsertShiftSummarySyncRecord({
      shiftId: fixtureShiftId('SHIFT-1'),
      summary: fixtureSummary('SHIFT-1', { ritTotal: 9 }),
      status: 'FAILED',
      attemptCount: 1,
      lastErrorCode: 'GOOGLE_REQUEST_FAILED',
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    const pending = await store.listPendingShiftSummarySyncRecords()
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    expect(pending.value).toHaveLength(1)
    expect(pending.value[0]?.summary.ritTotal).toBe(9)
    expect(pending.value[0]?.status).toBe('FAILED')
    store.close()
  })

  it('listPendingShiftSummarySyncRecords includes PENDING and FAILED, excludes SYNCING and SYNCED', async () => {
    const store = newStore()
    const statuses: ShiftSummarySyncRecord['status'][] = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED']
    for (const [index, status] of statuses.entries()) {
      await store.upsertShiftSummarySyncRecord({
        shiftId: fixtureShiftId(`SHIFT-${index}`),
        summary: fixtureSummary(`SHIFT-${index}`),
        status,
        attemptCount: 0,
        updatedAt: new Date('2026-09-04T00:00:00.000Z'),
      })
    }

    const pending = await store.listPendingShiftSummarySyncRecords()
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    expect(pending.value.map((record) => record.status).sort()).toEqual(['FAILED', 'PENDING'])
    store.close()
  })

  it('listShiftSummarySyncRecords returns every row regardless of status (Phase 18 §10/§11)', async () => {
    const store = newStore()
    const emptyResult = await store.listShiftSummarySyncRecords()
    expect(emptyResult).toEqual({ ok: true, value: [] })

    const statuses: ShiftSummarySyncRecord['status'][] = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED']
    for (const [index, status] of statuses.entries()) {
      await store.upsertShiftSummarySyncRecord({
        shiftId: fixtureShiftId(`SHIFT-${index}`),
        summary: fixtureSummary(`SHIFT-${index}`),
        status,
        attemptCount: 0,
        updatedAt: new Date('2026-09-04T00:00:00.000Z'),
      })
    }

    const allResult = await store.listShiftSummarySyncRecords()
    expect(allResult.ok).toBe(true)
    if (!allResult.ok) return
    expect(allResult.value.map((record) => record.status).sort()).toEqual(['FAILED', 'PENDING', 'SYNCED', 'SYNCING'])
    store.close()
  })
})
