import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MasterDataRemoteReader } from '@/application/google/google-ports'
import { AppsScriptPileAreaWriter } from '@/integrations/google/apps-script-pile-area-writer'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { err, ok } from '@/domain/common/result'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildPileArea() {
  return createPileAreaReference(
    value(parseSectorCode('BR1')),
    value(parsePileAreaCode('LS_18')),
    value(parsePileId('L18_S99')),
    value(parseOreCode('SAP')),
  )
}

function masterDataWith(pileAreas: MasterData['pileAreas']): MasterData {
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(value(parseSectorCode('BR1')))],
      locations: [],
      samplingHouses: [],
      pileAreas,
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [value(parseOreCode('SAP')), value(parseOreCode('LIM'))].map((oreCode) =>
        createOreSamplingConfig({
          oreCode,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ),
    }),
  )
}

function fakeReader(impl: MasterDataRemoteReader['readMasterData']): MasterDataRemoteReader {
  return { readMasterData: impl }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppsScriptPileAreaWriter', () => {
  it('POSTs a CORS-simple text/plain no-cors request, never application/json', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reader = fakeReader(async () => ok(masterDataWith([buildPileArea()])))

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result).toEqual({ ok: true, value: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://script.example/exec')
    expect(init.method).toBe('POST')
    expect(init.mode).toBe('no-cors')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8')
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'addPileArea',
      sectorCode: 'BR1',
      stockpileCode: 'LS_18',
      pileId: 'L18_S99',
      oreCode: 'SAP',
    })
  })

  it('verifies success by re-reading master data via JSONP and finding the exact row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const reader = fakeReader(async () => ok(masterDataWith([buildPileArea()])))

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('fails with APPS_SCRIPT_PILE_WRITE_UNVERIFIED when the row is missing after write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const reader = fakeReader(async () => ok(masterDataWith([])))

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('APPS_SCRIPT_PILE_WRITE_UNVERIFIED')
  })

  it('fails with APPS_SCRIPT_PILE_WRITE_UNVERIFIED when the verification re-read itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const reader = fakeReader(async () => err({ code: 'APPS_SCRIPT_TIMEOUT', message: 'timed out' }))

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('APPS_SCRIPT_PILE_WRITE_UNVERIFIED')
  })

  it('fails with DUPLICATE_PILE_ID when the same Pile_ID exists remotely with conflicting fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const conflicting = createPileAreaReference(
      value(parseSectorCode('BR1')),
      value(parsePileAreaCode('LS_18')),
      value(parsePileId('L18_S99')),
      value(parseOreCode('LIM')),
    )
    const reader = fakeReader(async () => ok(masterDataWith([conflicting])))

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_ID')
  })

  it('maps a network failure sending the write itself to APPS_SCRIPT_UNAVAILABLE, without ever reading master data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const reader = fakeReader(vi.fn())

    const writer = new AppsScriptPileAreaWriter('https://script.example/exec', reader)
    const result = await writer.addPileArea(buildPileArea())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('APPS_SCRIPT_UNAVAILABLE')
    expect(reader.readMasterData).not.toHaveBeenCalled()
  })
})
