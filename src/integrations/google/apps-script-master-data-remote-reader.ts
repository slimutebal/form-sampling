import type { MasterDataRemoteReader } from '@/application/google/google-ports'
import type { MasterDataInvalidDetail, MasterDataRefreshError } from '@/application/google/master-data-refresh-diagnostics'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { GOOGLE_MASTER_HEADERS } from './google-sheet-contract'
import {
  parseMasterDataFromRanges,
  type MasterDataValidationError,
  type RawMasterDataRanges,
} from './master-data-sheet-reader'

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
    if ('invalidTable' in ranges) {
      return remoteInvalid({ stage: 'REMOTE_PAYLOAD', causeCode: 'MASTER_DATA_PAYLOAD_SHAPE_INVALID', table: ranges.invalidTable })
    }

    const parsed = parseMasterDataFromRanges(ranges)
    return parsed.ok ? parsed : remoteInvalid(validationDetail(parsed.error))
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
        // Credential-free CORS load: without it the browser sends Google
        // session cookies, and with several signed-in accounts Google
        // rewrites the URL to /macros/u/N/… which returns 404. Both the
        // /exec redirect and the final googleusercontent response send
        // `Access-Control-Allow-Origin: *`. Set before `src` so the request
        // starts in CORS mode.
        script.crossOrigin = 'anonymous'
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

/** The public code stays `MASTER_DATA_REMOTE_INVALID`; `detail` keeps the original cause for diagnostics. */
function remoteInvalid(detail: MasterDataInvalidDetail): Result<never, MasterDataRefreshError> {
  return err({ code: 'MASTER_DATA_REMOTE_INVALID', message: 'Apps Script master-data payload is invalid', detail })
}

/** Copies only codes and the sheet location — never the parser's `message`, which can echo a cell value. */
function validationDetail(error: MasterDataValidationError): MasterDataInvalidDetail {
  return {
    stage: 'REMOTE_VALIDATION',
    causeCode: error.causeCode ? `${error.code}/${error.causeCode}` : error.code,
    ...(error.table !== undefined ? { table: error.table } : {}),
    ...(error.rowNumber !== undefined ? { rowNumber: error.rowNumber } : {}),
  }
}

function isRows(value: unknown): value is Rows {
  return Array.isArray(value) && value.every((row) => Array.isArray(row))
}

/**
 * Apps Script currently returns complete sheet rows for `tables`, even for
 * sheets whose app contract only consumes a leading range (for example,
 * `Employees!A:D` projects `Employee_ID | Name | Initial | Level` out of any
 * further columns the sheet may gain). Project only a verified leading
 * contract range here, and only when its header row matches; the parser below
 * still checks every required header and every required data value. A renamed,
 * reordered, or missing column inside the documented range is never accepted.
 */
function projectLeadingContractColumns(rows: Rows, headers: readonly string[]): Rows {
  const firstRow = rows[0]
  const hasExpectedLeadingHeaders = firstRow !== undefined && headers.every(
    (header, index) => String(firstRow[index] ?? '').trim() === header,
  )
  return hasExpectedLeadingHeaders ? rows.map((row) => row.slice(0, headers.length)) : rows
}

const PAYLOAD_TABLES = [
  'Employees',
  'Crews',
  'Sectors',
  'Sampling_Houses',
  'Pile_Areas',
  'Haulers',
  'Trucks',
  'Ore_Sampling_Config',
] as const

/**
 * Accepts the documented `{ tables: { Sheet_Name: rows } }` payload only.
 * On rejection, names the first missing/non-row table (or `tables` itself).
 */
function toRanges(body: unknown): RawMasterDataRanges | { readonly invalidTable: string } {
  if (typeof body !== 'object' || body === null || !('tables' in body)) return { invalidTable: 'tables' }
  const tables = body.tables
  if (typeof tables !== 'object' || tables === null) return { invalidTable: 'tables' }
  const read = (name: string): Rows | undefined => {
    const value = (tables as Record<string, unknown>)[name]
    return isRows(value) ? value : undefined
  }
  const invalidTable = PAYLOAD_TABLES.find((name) => !read(name))
  if (invalidTable) return { invalidTable }
  const employees = read('Employees')
  const crews = read('Crews')
  const sectors = read('Sectors')
  const samplingHouses = read('Sampling_Houses')
  const pileAreas = read('Pile_Areas')
  const haulers = read('Haulers')
  const trucks = read('Trucks')
  const oreSamplingConfigs = read('Ore_Sampling_Config')
  if (!employees || !crews || !sectors || !samplingHouses || !pileAreas || !haulers || !trucks || !oreSamplingConfigs) return { invalidTable: 'tables' }
  return {
    employees: projectLeadingContractColumns(employees, GOOGLE_MASTER_HEADERS.employees),
    crews: projectLeadingContractColumns(crews, GOOGLE_MASTER_HEADERS.crews),
    sectors: projectLeadingContractColumns(sectors, GOOGLE_MASTER_HEADERS.sectors),
    samplingHouses: projectLeadingContractColumns(samplingHouses, GOOGLE_MASTER_HEADERS.samplingHouses),
    pileAreas: projectLeadingContractColumns(pileAreas, GOOGLE_MASTER_HEADERS.pileAreas),
    haulers: projectLeadingContractColumns(haulers, GOOGLE_MASTER_HEADERS.haulers),
    trucks: projectLeadingContractColumns(trucks, GOOGLE_MASTER_HEADERS.trucks),
    oreSamplingConfigs: projectLeadingContractColumns(oreSamplingConfigs, GOOGLE_MASTER_HEADERS.oreSamplingConfigs),
  }
}
