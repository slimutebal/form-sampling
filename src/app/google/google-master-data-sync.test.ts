import { describe, expect, it, vi } from 'vitest'
import type { MasterDataCacheEntry, MasterDataCacheStore, MasterDataRemoteReader } from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { parseSectorCode } from '@/domain/common/codes'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createSectorReference } from '@/domain/master/references'
import { refreshAppsScriptMasterData } from './google-master-data-sync'

function must<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  const sector = must(parseSectorCode('BR1'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

class FakeReader implements MasterDataRemoteReader {
  private readonly result: Result<MasterData, DomainError>

  constructor(result: Result<MasterData, DomainError>) {
    this.result = result
  }

  async readMasterData(): Promise<Result<MasterData, DomainError>> {
    return this.result
  }
}

class FakeCache implements MasterDataCacheStore {
  entry: MasterDataCacheEntry | undefined
  replaceCalls = 0

  async readCachedMasterData(): Promise<Result<MasterDataCacheEntry | undefined, DomainError>> {
    return ok(this.entry)
  }

  async replaceMasterDataCache(masterData: MasterData, fetchedAt: Date): Promise<Result<void, DomainError>> {
    this.replaceCalls += 1
    this.entry = { masterData, fetchedAt }
    return ok(undefined)
  }
}

describe('refreshAppsScriptMasterData', () => {
  it('composes the reader with refreshMasterData and writes the cache on success', async () => {
    const masterData = buildMasterData()
    const cache = new FakeCache()
    const fixedNow = new Date('2026-09-05T00:00:00.000Z')

    const result = await refreshAppsScriptMasterData({
      reader: new FakeReader(ok(masterData)),
      cache,
      clock: { now: () => fixedNow },
    })

    expect(result).toEqual(ok({ masterData, fetchedAt: fixedNow }))
    expect(cache.replaceCalls).toBe(1)
    expect(cache.entry?.masterData).toEqual(masterData)
  })

  it('propagates a remote reader/parser failure as a stable DomainError without writing the cache', async () => {
    const cache = new FakeCache()

    const result = await refreshAppsScriptMasterData({
      reader: new FakeReader(err({ code: 'GOOGLE_MASTER_ROW_INVALID', message: 'Sectors row 3: bad code' })),
      cache,
      clock: { now: () => new Date() },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
    expect(cache.replaceCalls).toBe(0)
    expect(cache.entry).toBeUndefined()
  })

  it('leaves an existing cache entry untouched when the remote read fails', async () => {
    const existing = buildMasterData()
    const cache = new FakeCache()
    cache.entry = { masterData: existing, fetchedAt: new Date('2026-01-01') }

    const result = await refreshAppsScriptMasterData({
      reader: new FakeReader(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'network down' })),
      cache,
      clock: { now: () => new Date() },
    })

    expect(result.ok).toBe(false)
    expect(cache.replaceCalls).toBe(0)
    expect(cache.entry?.masterData).toEqual(existing)
  })

  it('returns a stable GOOGLE_CONFIG_UNAVAILABLE error when no override reader is supplied and env config is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', '')
    const result = await refreshAppsScriptMasterData({})
    vi.unstubAllEnvs()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_CONFIG_UNAVAILABLE')
  })
})
