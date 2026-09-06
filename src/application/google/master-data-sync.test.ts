import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/common/clock'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { buildFixtureMasterData } from '@/test/fixtures/haulage-operation-test-fixtures'
import type { MasterDataCacheEntry, MasterDataCacheStore, MasterDataRemoteReader } from './google-ports'
import { readCachedMasterData, refreshMasterData } from './master-data-sync'

const FIXED_NOW = new Date('2026-09-04T10:00:00.000Z')
const fixedClock: Clock = { now: () => FIXED_NOW }

function fakeReader(result: Result<MasterData, DomainError>): MasterDataRemoteReader {
  return { readMasterData: async () => result }
}

class FakeMasterDataCacheStore implements MasterDataCacheStore {
  private entry: MasterDataCacheEntry | undefined
  replaceCallCount = 0

  constructor(initial?: MasterDataCacheEntry) {
    this.entry = initial
  }

  async readCachedMasterData(): Promise<Result<MasterDataCacheEntry | undefined, DomainError>> {
    return ok(this.entry)
  }

  async replaceMasterDataCache(masterData: MasterData, fetchedAt: Date): Promise<Result<void, DomainError>> {
    this.replaceCallCount++
    this.entry = { masterData, fetchedAt }
    return ok(undefined)
  }
}

describe('refreshMasterData', () => {
  it('replaces the cache with the freshly validated snapshot using the injected Clock', async () => {
    const masterData = buildFixtureMasterData()
    const cache = new FakeMasterDataCacheStore()
    const result = await refreshMasterData({ reader: fakeReader(ok(masterData)), cache, clock: fixedClock })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.masterData).toBe(masterData)
    expect(result.value.fetchedAt).toBe(FIXED_NOW)
    expect(cache.replaceCallCount).toBe(1)

    const cached = await cache.readCachedMasterData()
    expect(cached.ok).toBe(true)
    if (!cached.ok) return
    expect(cached.value).toEqual({ masterData, fetchedAt: FIXED_NOW })
  })

  it('replaces a previous cache entry on a successful refresh', async () => {
    const previous = buildFixtureMasterData()
    const cache = new FakeMasterDataCacheStore({ masterData: previous, fetchedAt: new Date('2026-09-01T00:00:00.000Z') })
    const fresh = buildFixtureMasterData()

    await refreshMasterData({ reader: fakeReader(ok(fresh)), cache, clock: fixedClock })

    const cached = await cache.readCachedMasterData()
    expect(cached.ok).toBe(true)
    if (!cached.ok) return
    expect(cached.value?.masterData).toBe(fresh)
    expect(cached.value?.fetchedAt).toEqual(FIXED_NOW)
  })

  it('preserves the existing cache when the remote read fails, and never calls replace', async () => {
    const previous = buildFixtureMasterData()
    const previousFetchedAt = new Date('2026-09-01T00:00:00.000Z')
    const cache = new FakeMasterDataCacheStore({ masterData: previous, fetchedAt: previousFetchedAt })

    const result = await refreshMasterData({
      reader: fakeReader(err({ code: 'MASTER_DATA_REMOTE_INVALID', message: 'invalid remote payload' })),
      cache,
      clock: fixedClock,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MASTER_DATA_REMOTE_INVALID')
    expect(cache.replaceCallCount).toBe(0)

    const cached = await cache.readCachedMasterData()
    expect(cached.ok).toBe(true)
    if (!cached.ok) return
    expect(cached.value).toEqual({ masterData: previous, fetchedAt: previousFetchedAt })
  })
})

describe('readCachedMasterData', () => {
  it('returns undefined when nothing has ever been cached', async () => {
    const cache = new FakeMasterDataCacheStore()
    const result = await readCachedMasterData({ cache })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBeUndefined()
  })

  it('returns the last cached snapshot after a reload', async () => {
    const masterData = buildFixtureMasterData()
    const fetchedAt = new Date('2026-09-01T00:00:00.000Z')
    const cache = new FakeMasterDataCacheStore({ masterData, fetchedAt })

    const result = await readCachedMasterData({ cache })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ masterData, fetchedAt })
  })
})
