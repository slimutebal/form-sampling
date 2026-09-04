import type {
  GoogleAccessTokenProvider,
  GoogleSheetsTransport,
  GoogleSheetsValueRange,
} from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

/** Matches the global `fetch` signature — injectable so tests never make a real network call. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

function encodeRange(range: string): string {
  // `encodeURIComponent` alone would also escape the `!` sheet/range
  // separator, which Google Sheets requires literally in the URL path.
  return range.split('!').map(encodeURIComponent).join('!')
}

function buildValuesUrl(spreadsheetId: string, range: string, query: string): string {
  return `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(range)}${query}`
}

function buildAppendUrl(spreadsheetId: string, range: string, query: string): string {
  return `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeRange(range)}:append${query}`
}

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function isValueRangeShape(body: unknown): body is { range?: unknown; values?: unknown } {
  return typeof body === 'object' && body !== null
}

function isValuesArrayShape(values: unknown): values is readonly (readonly unknown[])[] {
  return values === undefined || (Array.isArray(values) && values.every((row) => Array.isArray(row)))
}

/**
 * Concrete Google Sheets API v4 transport (ROADMAP Phase 16 §5) built on
 * `fetch`. Authentication is entirely injected via
 * `GoogleAccessTokenProvider` — this class never decides how a token was
 * obtained, never stores one, and never logs one. No retry loop lives
 * here (rule §15) — retry policy is an application-layer sync concern.
 */
export class GoogleSheetsRestClient implements GoogleSheetsTransport {
  private readonly tokenProvider: GoogleAccessTokenProvider
  private readonly fetchImpl: FetchLike

  constructor(tokenProvider: GoogleAccessTokenProvider, fetchImpl: FetchLike = fetch) {
    this.tokenProvider = tokenProvider
    this.fetchImpl = fetchImpl
  }

  async getValues(spreadsheetId: string, range: string): Promise<Result<GoogleSheetsValueRange, DomainError>> {
    const tokenResult = await this.tokenProvider.getAccessToken()
    if (!tokenResult.ok) {
      return tokenResult
    }

    const url = buildValuesUrl(spreadsheetId, range, '?valueRenderOption=UNFORMATTED_VALUE')
    const responseResult = await this.request(url, { headers: authHeader(tokenResult.value) })
    if (!responseResult.ok) {
      return responseResult
    }

    const bodyResult = await this.readJson(responseResult.value)
    if (!bodyResult.ok) {
      return bodyResult
    }
    const body = bodyResult.value
    if (!isValueRangeShape(body) || !isValuesArrayShape(body.values) || (body.range !== undefined && typeof body.range !== 'string')) {
      return err({
        code: 'GOOGLE_RESPONSE_INVALID',
        message: 'Google Sheets getValues response did not match the expected values shape',
      })
    }
    return ok({
      range: typeof body.range === 'string' ? body.range : range,
      values: body.values ?? [],
    })
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.tokenProvider.getAccessToken()
    if (!tokenResult.ok) {
      return tokenResult
    }

    const url = buildValuesUrl(spreadsheetId, range, '?valueInputOption=RAW')
    const responseResult = await this.request(url, {
      method: 'PUT',
      headers: authHeader(tokenResult.value),
      body: JSON.stringify({ range, values }),
    })
    if (!responseResult.ok) {
      return responseResult
    }
    return ok(undefined)
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.tokenProvider.getAccessToken()
    if (!tokenResult.ok) {
      return tokenResult
    }

    const url = buildAppendUrl(spreadsheetId, range, '?valueInputOption=RAW&insertDataOption=OVERWRITE')
    const responseResult = await this.request(url, {
      method: 'POST',
      headers: authHeader(tokenResult.value),
      body: JSON.stringify({ range, values }),
    })
    if (!responseResult.ok) {
      return responseResult
    }
    return ok(undefined)
  }

  /** Issues the HTTP request and maps a network failure/non-2xx status to a stable error, never leaking the bearer token or the raw response body. */
  private async request(url: string, init: RequestInit): Promise<Result<Response, DomainError>> {
    let response: Response
    try {
      response = await this.fetchImpl(url, init)
    } catch {
      return err({ code: 'GOOGLE_REQUEST_FAILED', message: 'Network request to Google Sheets failed' })
    }
    if (!response.ok) {
      return err({
        code: 'GOOGLE_REQUEST_FAILED',
        message: `Google Sheets request failed with HTTP status ${response.status}`,
      })
    }
    return ok(response)
  }

  private async readJson(response: Response): Promise<Result<unknown, DomainError>> {
    try {
      return ok(await response.json())
    } catch {
      return err({ code: 'GOOGLE_RESPONSE_INVALID', message: 'Google Sheets response was not valid JSON' })
    }
  }
}
