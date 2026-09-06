import type { MasterDataRemoteReader } from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { parseMasterDataFromRanges, type RawMasterDataRanges } from './master-data-sheet-reader'

type Rows = readonly (readonly unknown[])[]
type JsonpGlobal = Record<string, unknown>

const JSONP_TIMEOUT_MS = 15_000
let nextCallbackId = 0

/**
 * JSONP adapter for the deployed Apps Script Web App. Apps Script responses
 * redirect through script.googleusercontent.com, whose browser CORS behavior
 * is unsuitable for `fetch`; a temporary, generated callback is therefore
 * used to receive the same documented payload. `parseMasterDataFromRanges`
 * remains the single master-data validation path.
 */
export class AppsScriptMasterDataRemoteReader implements MasterDataRemoteReader {
  private readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  async readMasterData(): Promise<Result<MasterData, DomainError>> {
    let body: unknown
    try {
      body = await this.loadJsonp()
    } catch (failure) {
      return err(jsonpFailure(failure))
    }

    const ranges = toRanges(body)
    if (!ranges) return remoteInvalid()

    const parsed = parseMasterDataFromRanges(ranges)
    return parsed.ok ? parsed : remoteInvalid()
  }

  private loadJsonp(): Promise<unknown> {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.head) {
      return Promise.reject('APPS_SCRIPT_UNAVAILABLE')
    }

    const globalScope = window as unknown as JsonpGlobal
    const callbackName = createCallbackName(globalScope)
    let script: HTMLScriptElement | undefined

    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        delete globalScope[callbackName]
        script?.remove()
      }
      const succeed = (payload: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(payload)
      }
      const fail = (code: JsonpFailureCode) => {
        if (settled) return
        settled = true
        cleanup()
        reject(code)
      }
      const timeoutId = window.setTimeout(() => fail('APPS_SCRIPT_TIMEOUT'), JSONP_TIMEOUT_MS)

      globalScope[callbackName] = succeed
      try {
        script = document.createElement('script')
        script.async = true
        script.src = this.masterDataUrl(callbackName)
        script.onerror = () => fail('APPS_SCRIPT_UNAVAILABLE')
        document.head.append(script)
      } catch {
        fail('APPS_SCRIPT_UNAVAILABLE')
      }
    })
  }

  private masterDataUrl(callbackName: string): string {
    const url = new URL(this.endpoint)
    url.searchParams.set('action', 'masterData')
    url.searchParams.set('callback', callbackName)
    return url.toString()
  }
}

type JsonpFailureCode = 'APPS_SCRIPT_UNAVAILABLE' | 'APPS_SCRIPT_TIMEOUT'

function createCallbackName(globalScope: JsonpGlobal): string {
  let callbackName: string
  do {
    nextCallbackId += 1
    callbackName = `__formSamplingMasterDataJsonp_${Date.now()}_${nextCallbackId}`
  } while (callbackName in globalScope)
  return callbackName
}

function jsonpFailure(failure: unknown): DomainError {
  return failure === 'APPS_SCRIPT_TIMEOUT'
    ? { code: 'APPS_SCRIPT_TIMEOUT', message: 'Apps Script master-data request timed out' }
    : { code: 'APPS_SCRIPT_UNAVAILABLE', message: 'Apps Script master-data is unavailable' }
}

function remoteInvalid(): Result<never, DomainError> {
  return err({ code: 'MASTER_DATA_REMOTE_INVALID', message: 'Apps Script master-data payload is invalid' })
}

function isRows(value: unknown): value is Rows {
  return Array.isArray(value) && value.every((row) => Array.isArray(row))
}

/** Accepts the documented `{ tables: { Sheet_Name: rows } }` payload only. */
function toRanges(body: unknown): RawMasterDataRanges | undefined {
  if (typeof body !== 'object' || body === null || !('tables' in body)) return undefined
  const tables = body.tables
  if (typeof tables !== 'object' || tables === null) return undefined
  const read = (name: string): Rows | undefined => {
    const value = (tables as Record<string, unknown>)[name]
    return isRows(value) ? value : undefined
  }
  const employees = read('Employees')
  const crews = read('Crews')
  const sectors = read('Sectors')
  const samplingHouses = read('Sampling_Houses')
  const pileAreas = read('Pile_Areas')
  const haulers = read('Haulers')
  const trucks = read('Trucks')
  const oreSamplingConfigs = read('Ore_Sampling_Config')
  if (!employees || !crews || !sectors || !samplingHouses || !pileAreas || !haulers || !trucks || !oreSamplingConfigs) return undefined
  return { employees, crews, sectors, samplingHouses, pileAreas, haulers, trucks, oreSamplingConfigs }
}
