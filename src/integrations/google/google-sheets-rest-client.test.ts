import { describe, expect, it, vi } from 'vitest'
import { err, ok } from '@/domain/common/result'
import type { GoogleAccessTokenProvider } from '@/application/google/google-ports'
import { GoogleSheetsRestClient } from './google-sheets-rest-client'

const SECRET_TOKEN = 'super-secret-access-token'

function fakeTokenProvider(token = SECRET_TOKEN): GoogleAccessTokenProvider {
  return { getAccessToken: async () => ok(token) }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('GoogleSheetsRestClient.getValues', () => {
  it('returns the parsed range/values on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { range: 'Sectors!A1:A2', values: [['Sector_Code'], ['BR1']] }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ range: 'Sectors!A1:A2', values: [['Sector_Code'], ['BR1']] })
  })

  it('sends the Authorization bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { values: [] }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    await client.getValues('SHEET-1', 'Sectors!A:A')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${SECRET_TOKEN}`)
  })

  it('safely encodes the spreadsheetId and range in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { values: [] }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    await client.getValues('SHEET ID/WITH#CHARS', 'Pile Areas!A:D')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain(encodeURIComponent('SHEET ID/WITH#CHARS'))
    expect(url).toContain(encodeURIComponent('Pile Areas') + '!' + encodeURIComponent('A:D'))
    expect(url).not.toContain(' ')
  })

  it('requests UNFORMATTED_VALUE so numeric cells are never coerced from formatted text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { values: [] }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    await client.getValues('SHEET-1', 'Ore_Sampling_Config!A:D')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE')
  })

  it('propagates GOOGLE_AUTH_UNAVAILABLE without making a network request', async () => {
    const fetchMock = vi.fn()
    const tokenProvider: GoogleAccessTokenProvider = {
      getAccessToken: async () => err({ code: 'GOOGLE_AUTH_UNAVAILABLE', message: 'no token' }),
    }
    const client = new GoogleSheetsRestClient(tokenProvider, fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_AUTH_UNAVAILABLE')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a non-2xx response to GOOGLE_REQUEST_FAILED without leaking the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: { message: 'permission denied' } }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')
    expect(JSON.stringify(result.error)).not.toContain(SECRET_TOKEN)
  })

  it('maps an unparsable JSON body to GOOGLE_RESPONSE_INVALID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_RESPONSE_INVALID')
  })

  it('maps a well-formed JSON body with the wrong shape to GOOGLE_RESPONSE_INVALID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { values: 'not-an-array' }))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_RESPONSE_INVALID')
  })

  it('maps a thrown network failure to GOOGLE_REQUEST_FAILED', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.getValues('SHEET-1', 'Sectors!A:A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')
  })
})

describe('GoogleSheetsRestClient.updateValues', () => {
  it('PUTs to the values endpoint with valueInputOption=RAW and returns ok on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.updateValues('SHEET-1', 'Shift_Summary!A2:I2', [['SHIFT-1']])
    expect(result.ok).toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(url).toContain('valueInputOption=RAW')
  })

  it('maps a non-2xx update response to GOOGLE_REQUEST_FAILED', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.updateValues('SHEET-1', 'Shift_Summary!A2:I2', [['SHIFT-1']])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')
  })
})

describe('GoogleSheetsRestClient.appendValues', () => {
  it('POSTs to the :append endpoint and returns ok on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    const result = await client.appendValues('SHEET-1', 'Shift_Summary!A:I', [['SHIFT-1']])
    expect(result.ok).toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(':append')
    expect(init.method).toBe('POST')
  })

  it('sends the Authorization bearer header on append', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    const client = new GoogleSheetsRestClient(fakeTokenProvider(), fetchMock)

    await client.appendValues('SHEET-1', 'Shift_Summary!A:I', [['SHIFT-1']])

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${SECRET_TOKEN}`)
  })
})
