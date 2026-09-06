import { describe, expect, it, vi } from 'vitest'
import { systemClock } from '@/application/common/clock'
import type { MasterDataCacheStore, PileAreaRemoteWriter } from '@/application/google/google-ports'
import { createPileAreaForSetup } from '@/application/pile-master/create-pile-area-for-setup'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { err, ok } from '@/domain/common/result'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  const br1 = value(parseSectorCode('BR1'))
  const sap = value(parseOreCode('SAP'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(br1)],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function buildDraft(): NewPileDraft {
  return { pileId: 'L18_S99' }
}

function fakeWriter(impl: PileAreaRemoteWriter['addPileArea']): PileAreaRemoteWriter {
  return { addPileArea: impl }
}

function fakeCacheStore(): MasterDataCacheStore & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    async readCachedMasterData() {
      return ok(undefined)
    },
    async replaceMasterDataCache(masterData, fetchedAt) {
      calls.push({ masterData, fetchedAt })
      return ok(undefined)
    },
  }
}

describe('createPileAreaForSetup', () => {
  const sectorCode = value(parseSectorCode('BR1'))

  it('writes remote, then returns a merged/re-validated MasterData containing the new pile', async () => {
    const writer = fakeWriter(async () => ok(undefined))
    const cacheStore = fakeCacheStore()

    const result = await createPileAreaForSetup(
      { draft: buildDraft(), sectorCode, masterData: buildMasterData() },
      { remoteWriter: writer, clock: systemClock, isOnline: () => true, cacheStore },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pileArea).toEqual({
      sectorCode: 'BR1',
      stockpileCode: 'LS_18',
      pileId: 'L18_S99',
      oreCode: 'SAP',
    })
    expect(result.value.masterData.pileAreas).toHaveLength(1)
    expect(cacheStore.calls).toHaveLength(1)
  })

  it('never attempts the remote write while offline, and returns the original MasterData unchanged', async () => {
    const writer = fakeWriter(vi.fn())

    const result = await createPileAreaForSetup(
      { draft: buildDraft(), sectorCode, masterData: buildMasterData() },
      { remoteWriter: writer, clock: systemClock, isOnline: () => false },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_MASTER_CREATION_REQUIRES_CONNECTION')
    expect(writer.addPileArea).not.toHaveBeenCalled()
  })

  it('rejects invalid drafts before ever attempting a remote write', async () => {
    const writer = fakeWriter(vi.fn())

    const result = await createPileAreaForSetup(
      { draft: { pileId: '' }, sectorCode, masterData: buildMasterData() },
      { remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(false)
    expect(writer.addPileArea).not.toHaveBeenCalled()
  })

  it('propagates a remote write failure without touching the cache', async () => {
    const writer = fakeWriter(async () => err({ code: 'DUPLICATE_PILE_ID', message: 'exists remotely' }))
    const cacheStore = fakeCacheStore()

    const result = await createPileAreaForSetup(
      { draft: buildDraft(), sectorCode, masterData: buildMasterData() },
      { remoteWriter: writer, clock: systemClock, isOnline: () => true, cacheStore },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_ID')
    expect(cacheStore.calls).toHaveLength(0)
  })

  it('works without a cacheStore at all (best-effort, not required)', async () => {
    const writer = fakeWriter(async () => ok(undefined))

    const result = await createPileAreaForSetup(
      { draft: buildDraft(), sectorCode, masterData: buildMasterData() },
      { remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(true)
  })
})
