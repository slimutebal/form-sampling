import { describe, expect, it, vi } from 'vitest'
import { systemClock } from '@/application/common/clock'
import type { PileAreaRemoteWriter } from '@/application/google/google-ports'
import { activateNewPile, type ActivateNewPileStore } from '@/application/pile-master/activate-new-pile'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseShiftId } from '@/domain/common/identifiers'
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

function fakeStore(): ActivateNewPileStore & {
  activateCalls: unknown[]
  cacheCalls: unknown[]
} {
  const activateCalls: unknown[] = []
  const cacheCalls: unknown[] = []
  return {
    activateCalls,
    cacheCalls,
    async activateNewMasterPile(shiftId, pile, pileArea) {
      activateCalls.push({ shiftId, pile, pileArea })
      return ok(undefined)
    },
    async replaceMasterDataCache(masterData, fetchedAt) {
      cacheCalls.push({ masterData, fetchedAt })
      return ok(undefined)
    },
  }
}

function fakeWriter(impl: PileAreaRemoteWriter['addPileArea']): PileAreaRemoteWriter {
  return { addPileArea: impl }
}

describe('activateNewPile', () => {
  const shiftId = value(parseShiftId('SHIFT-1'))
  const sectorCode = value(parseSectorCode('BR1'))

  it('validates, writes remote, then activates locally and refreshes the cache, in that order', async () => {
    const store = fakeStore()
    const calls: string[] = []
    const writer = fakeWriter(async (pileArea) => {
      calls.push('remote')
      expect(pileArea.pileId).toBe('L18_S99')
      return ok(undefined)
    })

    const result = await activateNewPile(
      { draft: buildDraft(), shiftId, sectorCode, masterData: buildMasterData() },
      { store, remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pile).toEqual({ id: 'L18_S99', oreCode: 'SAP' })
    expect(store.activateCalls).toHaveLength(1)
    expect(store.cacheCalls).toHaveLength(1)
  })

  it('rejects invalid drafts before ever attempting a remote write', async () => {
    const store = fakeStore()
    const writer = fakeWriter(vi.fn())

    const result = await activateNewPile(
      { draft: { pileId: '' }, shiftId, sectorCode, masterData: buildMasterData() },
      { store, remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(false)
    expect(writer.addPileArea).not.toHaveBeenCalled()
    expect(store.activateCalls).toHaveLength(0)
  })

  it('never attempts the remote write while offline, and touches nothing local', async () => {
    const store = fakeStore()
    const writer = fakeWriter(vi.fn())

    const result = await activateNewPile(
      { draft: buildDraft(), shiftId, sectorCode, masterData: buildMasterData() },
      { store, remoteWriter: writer, clock: systemClock, isOnline: () => false },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PILE_MASTER_CREATION_REQUIRES_CONNECTION')
    expect(writer.addPileArea).not.toHaveBeenCalled()
    expect(store.activateCalls).toHaveLength(0)
    expect(store.cacheCalls).toHaveLength(0)
  })

  it('leaves every local write untouched when the remote write fails', async () => {
    const store = fakeStore()
    const writer = fakeWriter(async () => err({ code: 'DUPLICATE_PILE_ID', message: 'exists remotely' }))

    const result = await activateNewPile(
      { draft: buildDraft(), shiftId, sectorCode, masterData: buildMasterData() },
      { store, remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_ID')
    expect(store.activateCalls).toHaveLength(0)
    expect(store.cacheCalls).toHaveLength(0)
  })

  it('propagates a local activation failure without touching the cache', async () => {
    const store: ActivateNewPileStore & { cacheCalls: unknown[] } = {
      cacheCalls: [],
      async activateNewMasterPile() {
        return err({ code: 'SHIFT_WORKSPACE_NOT_FOUND', message: 'no workspace' })
      },
      async replaceMasterDataCache(masterData, fetchedAt) {
        this.cacheCalls.push({ masterData, fetchedAt })
        return ok(undefined)
      },
    }
    const writer = fakeWriter(async () => ok(undefined))

    const result = await activateNewPile(
      { draft: buildDraft(), shiftId, sectorCode, masterData: buildMasterData() },
      { store, remoteWriter: writer, clock: systemClock, isOnline: () => true },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_WORKSPACE_NOT_FOUND')
    expect(store.cacheCalls).toHaveLength(0)
  })
})
