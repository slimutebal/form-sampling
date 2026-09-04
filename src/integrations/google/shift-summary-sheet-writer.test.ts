import { describe, expect, it } from 'vitest'
import type { ShiftSummary } from '@/application/google/shift-summary'
import type { GoogleSheetsTransport, GoogleSheetsValueRange } from '@/application/google/google-ports'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import {
  GOOGLE_SHIFT_SUMMARY_HEADER_RANGE,
  GOOGLE_SHIFT_SUMMARY_HEADERS,
  GOOGLE_SHIFT_SUMMARY_ID_COLUMN_RANGE,
} from './google-sheet-contract'
import { ShiftSummarySheetWriter } from './shift-summary-sheet-writer'

function summary(shiftId: string, overrides: Partial<ShiftSummary> = {}): ShiftSummary {
  return {
    shiftId,
    date: '2026-09-04',
    shiftCode: 'D',
    sectorCode: 'S1',
    samplingHouseCode: 'HOUSE-1',
    ritTotal: 3,
    batchTotal: 1,
    incrementTotal: 3,
    wrongTruckTotal: 1,
    ...overrides,
  } as ShiftSummary
}

type Call = { readonly method: 'get' | 'update' | 'append'; readonly range: string }

class FakeShiftSummaryTransport implements GoogleSheetsTransport {
  rows: (readonly (string | number)[])[] = []
  calls: Call[] = []
  headerOverride?: readonly (readonly unknown[])[]

  async getValues(_spreadsheetId: string, range: string): Promise<Result<GoogleSheetsValueRange, DomainError>> {
    this.calls.push({ method: 'get', range })
    if (range === GOOGLE_SHIFT_SUMMARY_HEADER_RANGE) {
      return ok({ range, values: this.headerOverride ?? [[...GOOGLE_SHIFT_SUMMARY_HEADERS]] })
    }
    if (range === GOOGLE_SHIFT_SUMMARY_ID_COLUMN_RANGE) {
      return ok({ range, values: this.rows.map((row) => [row[0]]) })
    }
    return err({ code: 'GOOGLE_REQUEST_FAILED', message: `unexpected range requested in test: ${range}` })
  }

  async updateValues(
    _spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>> {
    this.calls.push({ method: 'update', range })
    const match = /!A(\d+):I\d+$/.exec(range)
    if (!match) {
      return err({ code: 'GOOGLE_REQUEST_FAILED', message: `unexpected update range in test: ${range}` })
    }
    const rowIndex = Number(match[1]) - 2
    this.rows[rowIndex] = values[0] as readonly (string | number)[]
    return ok(undefined)
  }

  async appendValues(
    _spreadsheetId: string,
    range: string,
    values: readonly (readonly unknown[])[],
  ): Promise<Result<void, DomainError>> {
    this.calls.push({ method: 'append', range })
    this.rows.push(values[0] as readonly (string | number)[])
    return ok(undefined)
  }
}

describe('ShiftSummarySheetWriter.upsertShiftSummary', () => {
  it('appends one row with the exact 9 headers in order on first sync', async () => {
    const transport = new FakeShiftSummaryTransport()
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    const result = await writer.upsertShiftSummary(summary('SHIFT-1'))
    expect(result.ok).toBe(true)
    expect(transport.rows).toHaveLength(1)
    expect(transport.rows[0]).toEqual(['SHIFT-1', '2026-09-04', 'D', 'S1', 'HOUSE-1', 3, 1, 3, 1])
    expect(GOOGLE_SHIFT_SUMMARY_HEADERS).toEqual([
      'Shift_ID',
      'Date',
      'Shift',
      'Sector',
      'Sampling_House_Code',
      'Rit_Total',
      'Batch_Total',
      'Increment_Total',
      'Wrong_Truck_Total',
    ])
  })

  it('updates the same logical row on a second sync for the same Shift_ID, never appending a duplicate', async () => {
    const transport = new FakeShiftSummaryTransport()
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    await writer.upsertShiftSummary(summary('SHIFT-1', { ritTotal: 3, batchTotal: 1 }))
    const secondResult = await writer.upsertShiftSummary(summary('SHIFT-1', { ritTotal: 9, batchTotal: 2 }))

    expect(secondResult.ok).toBe(true)
    expect(transport.rows).toHaveLength(1)
    expect(transport.rows[0][5]).toBe(9)
    expect(transport.rows[0][6]).toBe(2)
    expect(transport.calls.filter((call) => call.method === 'append')).toHaveLength(1)
    expect(transport.calls.filter((call) => call.method === 'update')).toHaveLength(1)
  })

  it('updates only the matching Shift_ID row, leaving other shifts untouched', async () => {
    const transport = new FakeShiftSummaryTransport()
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    await writer.upsertShiftSummary(summary('SHIFT-1', { ritTotal: 1 }))
    await writer.upsertShiftSummary(summary('SHIFT-2', { ritTotal: 2 }))
    await writer.upsertShiftSummary(summary('SHIFT-1', { ritTotal: 99 }))

    expect(transport.rows).toHaveLength(2)
    expect(transport.rows.find((row) => row[0] === 'SHIFT-1')?.[5]).toBe(99)
    expect(transport.rows.find((row) => row[0] === 'SHIFT-2')?.[5]).toBe(2)
  })

  it('never recalculates totals — writes exactly the given ShiftSummary values', async () => {
    const transport = new FakeShiftSummaryTransport()
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    await writer.upsertShiftSummary(summary('SHIFT-1', { ritTotal: 12345, wrongTruckTotal: 777 }))

    expect(transport.rows[0][5]).toBe(12345)
    expect(transport.rows[0][8]).toBe(777)
  })

  it('rejects when the Shift_Summary header row does not match the expected contract', async () => {
    const transport = new FakeShiftSummaryTransport()
    transport.headerOverride = [['Wrong', 'Header']]
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    const result = await writer.upsertShiftSummary(summary('SHIFT-1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_SHIFT_SUMMARY_HEADER_MISMATCH')
    expect(transport.rows).toHaveLength(0)
  })

  it('propagates a transport failure without writing anything', async () => {
    const transport: GoogleSheetsTransport = {
      getValues: async () => err({ code: 'GOOGLE_REQUEST_FAILED', message: 'network down' }),
      updateValues: async () => ok(undefined),
      appendValues: async () => ok(undefined),
    }
    const writer = new ShiftSummarySheetWriter({ transport, config: { spreadsheetId: 'SHEET-1' } })

    const result = await writer.upsertShiftSummary(summary('SHIFT-1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')
  })
})
