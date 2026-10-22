import type { MasterDataRemoteReader } from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { cellText, GOOGLE_MASTER_HEADERS } from './google-sheet-contract'
import { parseMasterDataFromRanges, type RawMasterDataRanges } from './master-data-sheet-reader'

type Rows = readonly (readonly unknown[])[]
type JsonpGlobal = Record<string, unknown>

const JSONP_TIMEOUT_MS = 15_000
let nextCallbackId = 0

function logRemoteMasterData(event: string, details: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.info(`[master-data] ${event}`, details)
}

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
      logRemoteMasterData('jsonp-failed', { code: failure === 'APPS_SCRIPT_TIMEOUT' ? 'APPS_SCRIPT_TIMEOUT' : 'APPS_SCRIPT_UNAVAILABLE' })
      return err(jsonpFailure(failure))
    }

    const ranges = toRanges(body)
    if (!ranges) {
      logRemoteMasterData('remote-payload-invalid', { reason: 'MISSING_OR_INVALID_TABLES' })
      return remoteInvalid()
    }

    const parsed = parseMasterDataFromRanges(ranges)
    if (!parsed.ok) {
      if (parsed.error.code === 'GOOGLE_MASTER_REQUIRED_HEADER_MISSING') {
        logRequiredHeaderDetails(body)
      }
      logRemoteMasterData('remote-payload-invalid', { reason: parsed.error.code })
      return remoteInvalid()
    }
    logRemoteMasterData('remote-payload-valid', {
      employees: ranges.employees.length,
      sectors: ranges.sectors.length,
      pileAreas: ranges.pileAreas.length,
    })
    return parsed
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
        script.crossOrigin = 'anonymous'
        script.src = this.masterDataUrl(callbackName)
        logRemoteMasterData('jsonp-request-started', { endpoint: new URL(this.endpoint).origin + new URL(this.endpoint).pathname })
        script.onerror = () => {
          // JSONP script errors intentionally expose no HTTP status to page JS.
          logRemoteMasterData('jsonp-script-error', { reason: 'SCRIPT_LOAD_ERROR_NO_HTTP_STATUS' })
          fail('APPS_SCRIPT_UNAVAILABLE')
        }
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

/**
 * Apps Script currently returns complete sheet rows for `tables`, even for
 * sheets whose app contract only consumes a leading range (for example,
 * `Employees!A:C` while the sheet also has columns beyond `Level`). Project
 * only the required contract columns here; the parser below still checks
 * every required header and every required data value. Required headers must
 * remain exact, unique, and in their documented relative order. Extra columns
 * may appear anywhere (for example Employees.Initial before Employees.Level).
 */
function projectLeadingContractColumns(rows: Rows, headers: readonly string[]): Rows {
  const firstRow = rows[0]
  if (!firstRow) return rows
  const headerPositions = headers.map((header) => firstRow.findIndex((cell) => cellText(cell) === header))
  const eachRequiredHeaderAppearsOnce = headers.every(
    (header) => firstRow.filter((cell) => cellText(cell) === header).length === 1,
  )
  const keepsRequiredOrder = headerPositions.every((position, index) => index === 0 || position > headerPositions[index - 1])
  if (headerPositions.some((position) => position < 0) || !eachRequiredHeaderAppearsOnce || !keepsRequiredOrder) {
    return rows
  }
  return rows.map((row) => headerPositions.map((position) => row[position]))
}

function logRequiredHeaderDetails(body: unknown) {
  if (!import.meta.env.DEV || typeof body !== 'object' || body === null || !('tables' in body)) return
  const tables = body.tables
  if (typeof tables !== 'object' || tables === null) return
  const contracts: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Employees', GOOGLE_MASTER_HEADERS.employees],
    ['Crews', GOOGLE_MASTER_HEADERS.crews],
    ['Sectors', GOOGLE_MASTER_HEADERS.sectors],
    ['Sampling_Houses', GOOGLE_MASTER_HEADERS.samplingHouses],
    ['Pile_Areas', GOOGLE_MASTER_HEADERS.pileAreas],
    ['Haulers', GOOGLE_MASTER_HEADERS.haulers],
    ['Trucks', GOOGLE_MASTER_HEADERS.trucks],
    ['Ore_Sampling_Config', GOOGLE_MASTER_HEADERS.oreSamplingConfigs],
  ]
  for (const [table, expectedHeaders] of contracts) {
    const candidate = (tables as Record<string, unknown>)[table]
    const actualHeaders = Array.isArray(candidate) && Array.isArray(candidate[0])
      ? candidate[0].map((cell) => cellText(cell))
      : []
    const missingHeaders = expectedHeaders.filter((header) => !actualHeaders.includes(header))
    const expectedPositionsMatch = expectedHeaders.every((header, index) => actualHeaders[index] === header)
    if (missingHeaders.length > 0 || !expectedPositionsMatch) {
      logRemoteMasterData('required-header-missing', {
        table,
        missingHeader: missingHeaders[0] ?? expectedHeaders.find((header, index) => actualHeaders[index] !== header),
        missingHeaders,
        expectedHeaders,
        actualHeaders,
        reason: missingHeaders.length > 0 ? 'HEADER_NOT_PRESENT' : 'HEADER_POSITION_MISMATCH',
      })
    }
  }
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
