import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppsScriptMasterDataRemoteReader } from './apps-script-master-data-remote-reader'

const validPayload = {
  tables: {
    Employees: [['Employee_ID', 'Name']],
    Crews: [['Crew_ID', 'Name', 'Job']],
    Sectors: [['Sector_Code'], ['BR1']],
    Sampling_Houses: [['Sector_Code', 'Sampling_House_Code'], ['BR1', 'SH1']],
    Pile_Areas: [['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore']],
    Haulers: [['Hauler_Code', 'Name']],
    Trucks: [['Truck_ID', 'Hauler_Code']],
    Ore_Sampling_Config: [['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing']],
  },
}

function jsonpScript(): HTMLScriptElement {
  const script = document.head.querySelector<HTMLScriptElement>('script[src]')
  if (!script) throw new Error('expected JSONP script')
  return script
}

function callbackFor(script: HTMLScriptElement): (payload: unknown) => void {
  const callbackName = new URL(script.src).searchParams.get('callback')
  if (!callbackName) throw new Error('expected JSONP callback')
  const callback = (window as unknown as Record<string, unknown>)[callbackName]
  if (typeof callback !== 'function') throw new Error('expected JSONP callback function')
  return callback as (payload: unknown) => void
}

afterEach(() => {
  vi.useRealTimers()
  document.head.querySelectorAll('script[src]').forEach((script) => script.remove())
})

describe('AppsScriptMasterDataRemoteReader', () => {
  it('creates a JSONP script with action=masterData, then validates its callback payload', async () => {
    const reader = new AppsScriptMasterDataRemoteReader('https://example.test/exec?existing=value&callback=untrusted')
    const pending = reader.readMasterData()
    const script = jsonpScript()
    const url = new URL(script.src)

    expect(url.searchParams.get('existing')).toBe('value')
    expect(url.searchParams.get('action')).toBe('masterData')
    expect(url.searchParams.get('callback')).toMatch(/^__formSamplingMasterDataJsonp_[A-Za-z0-9_]+$/)
    expect(url.searchParams.get('callback')).not.toBe('untrusted')

    callbackFor(script)(validPayload)

    const result = await pending
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.sectors).toEqual([{ code: 'BR1' }])
    expect(document.head.contains(script)).toBe(false)
    expect((window as unknown as Record<string, unknown>)[url.searchParams.get('callback') ?? '']).toBeUndefined()
  })

  it('maps a script error to the stable unavailable error and cleans up', async () => {
    const reader = new AppsScriptMasterDataRemoteReader('https://example.test/exec')
    const pending = reader.readMasterData()
    const script = jsonpScript()
    const callbackName = new URL(script.src).searchParams.get('callback') ?? ''

    script.dispatchEvent(new Event('error'))

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'APPS_SCRIPT_UNAVAILABLE' } })
    expect(document.head.contains(script)).toBe(false)
    expect((window as unknown as Record<string, unknown>)[callbackName]).toBeUndefined()
  })

  it('maps a missing callback to the stable timeout error and cleans up', async () => {
    vi.useFakeTimers()
    const reader = new AppsScriptMasterDataRemoteReader('https://example.test/exec')
    const pending = reader.readMasterData()
    const script = jsonpScript()
    const callbackName = new URL(script.src).searchParams.get('callback') ?? ''

    await vi.advanceTimersByTimeAsync(15_000)

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'APPS_SCRIPT_TIMEOUT' } })
    expect(document.head.contains(script)).toBe(false)
    expect((window as unknown as Record<string, unknown>)[callbackName]).toBeUndefined()
  })

  it('rejects malformed payloads through the existing parser before cache code can write them', async () => {
    const reader = new AppsScriptMasterDataRemoteReader('https://example.test/exec')
    const pending = reader.readMasterData()
    callbackFor(jsonpScript())({
      ...validPayload,
      tables: { ...validPayload.tables, Sectors: [['Wrong_Header']] },
    })

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'MASTER_DATA_REMOTE_INVALID' } })
  })
})
