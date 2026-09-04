import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

/**
 * Fixed, real Google Sheet contract (ROADMAP Phase 16 §1). Every range
 * is deliberately the smallest column span the sheet actually needs —
 * there is NO `Locations` range: no such sheet exists in the production
 * workbook, and none is invented here.
 *
 * `spreadsheetId` is explicit caller/environment-supplied configuration
 * (never hard-coded here, even though it is not itself a secret) — this
 * keeps the production spreadsheet swappable without a code change and
 * keeps every module in this layer testable against a fake id.
 */
export interface GoogleSheetsConfig {
  readonly spreadsheetId: string
}

export const GOOGLE_MASTER_SHEET_RANGES = {
  employees: 'Employees!A:B',
  crews: 'Crews!A:C',
  sectors: 'Sectors!A:A',
  samplingHouses: 'Sampling_Houses!A:B',
  pileAreas: 'Pile_Areas!A:D',
  haulers: 'Haulers!A:B',
  trucks: 'Trucks!A:B',
  oreSamplingConfigs: 'Ore_Sampling_Config!A:D',
} as const

export const GOOGLE_MASTER_HEADERS = {
  employees: ['Employee_ID', 'Name'],
  crews: ['Crew_ID', 'Name', 'Job'],
  sectors: ['Sector_Code'],
  samplingHouses: ['Sector_Code', 'Sampling_House_Code'],
  pileAreas: ['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore'],
  haulers: ['Hauler_Code', 'Name'],
  trucks: ['Truck_ID', 'Hauler_Code'],
  oreSamplingConfigs: ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
} as const

export const GOOGLE_SHIFT_SUMMARY_SHEET_NAME = 'Shift_Summary'
export const GOOGLE_SHIFT_SUMMARY_RANGE = 'Shift_Summary!A:I'
export const GOOGLE_SHIFT_SUMMARY_HEADER_RANGE = 'Shift_Summary!A1:I1'
/** Read-only Shift_ID column, starting below the header, used to locate an existing row for upsert (Phase 16 §9). */
export const GOOGLE_SHIFT_SUMMARY_ID_COLUMN_RANGE = 'Shift_Summary!A2:A'

export const GOOGLE_SHIFT_SUMMARY_HEADERS = [
  'Shift_ID',
  'Date',
  'Shift',
  'Sector',
  'Sampling_House_Code',
  'Rit_Total',
  'Batch_Total',
  'Increment_Total',
  'Wrong_Truck_Total',
] as const

/** Turns any Google Sheets cell value into a trimmed string, treating `undefined`/`null` as empty. */
export function cellText(cell: unknown): string {
  if (cell === undefined || cell === null) return ''
  return String(cell).trim()
}

/** A row is blank when every one of its first `columnCount` cells is empty — such trailing rows are ignored, never treated as data (Phase 16 §4). */
export function isRowBlank(row: readonly unknown[], columnCount: number): boolean {
  for (let index = 0; index < columnCount; index++) {
    if (cellText(row[index]).length > 0) return false
  }
  return true
}

/**
 * Validates that `values[0]` is exactly the expected header row (same
 * cell text, same order, no extra trailing column) and returns the
 * remaining data rows. Every Google dataset requires its exact header —
 * a sheet with the right data but a renamed/reordered/missing column is
 * never guessed at (Phase 16 §4/§9).
 */
export function requireExactHeaderRow(
  values: readonly (readonly unknown[])[],
  expectedHeaders: readonly string[],
  sheetLabel: string,
  errorCode: string = 'GOOGLE_MASTER_REQUIRED_HEADER_MISSING',
): Result<readonly (readonly unknown[])[], DomainError> {
  const headerRow = values[0]
  if (headerRow === undefined) {
    return err({
      code: errorCode,
      message: `Sheet "${sheetLabel}" has no header row`,
    })
  }
  const actualHeaders = expectedHeaders.map((_, index) => cellText(headerRow[index]))
  const headersMatch = expectedHeaders.every((header, index) => actualHeaders[index] === header)
  const hasExtraColumn =
    headerRow.length > expectedHeaders.length && cellText(headerRow[expectedHeaders.length]).length > 0
  if (!headersMatch || hasExtraColumn) {
    return err({
      code: errorCode,
      message: `Sheet "${sheetLabel}" header row does not match the expected headers [${expectedHeaders.join(', ')}]`,
    })
  }
  return ok(values.slice(1))
}
