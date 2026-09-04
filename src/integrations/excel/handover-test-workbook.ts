import * as XLSX from 'xlsx'
import { REQUIRED_HANDOVER_SHEET_COLUMNS } from '../../domain/handover/handover-schema'

/**
 * Test-only helper for building an in-memory handover workbook matching
 * the ARCHITECTURE.md §9 contract, without depending on a real file on
 * disk. Not imported by any production module.
 */
export interface BuildHandoverWorkbookParams {
  readonly appData: Readonly<Record<string, unknown>>
  /** A single previous-shift row (the normal case), multiple rows (to simulate MULTIPLE_SHIFT_INFO_ROWS), or omitted for zero rows. */
  readonly shiftInfo?:
    Readonly<Record<string, unknown>> | readonly Readonly<Record<string, unknown>>[]
  readonly pendingSample?: readonly Readonly<Record<string, unknown>>[]
  readonly samplePosition?: readonly Readonly<Record<string, unknown>>[]
  /** Sheet names to actually write — defaults to all four required sheets; used to simulate a missing sheet. */
  readonly sheetNames?: readonly string[]
  /** Additional arbitrary sheets (e.g. a real archive's `Haulage_Detail`) to prove they are ignored on read. */
  readonly extraSheets?: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>
  /**
   * Explicit header row per required sheet, written even when that sheet
   * has zero data rows. Defaults to the sheet's required columns — pass
   * an override (e.g. a column omitted) to simulate MISSING_REQUIRED_COLUMN
   * independent of whether any data rows exist.
   */
  readonly headers?: {
    readonly App_Data?: readonly string[]
    readonly Shift_Info?: readonly string[]
    readonly Pending_Sample?: readonly string[]
    readonly Sample_Position?: readonly string[]
  }
}

/** Writes an explicit header row followed by data rows, so the header exists structurally even with zero data rows. */
function rowsToSheet(
  headers: readonly string[],
  rows: readonly Readonly<Record<string, unknown>>[],
): XLSX.WorkSheet {
  const aoa: unknown[][] = [
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header])),
  ]
  return XLSX.utils.aoa_to_sheet(aoa)
}

export function buildHandoverWorkbookBytes(params: BuildHandoverWorkbookParams): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  const appDataRows = Object.entries(params.appData).map(([Key, Value]) => ({ Key, Value }))
  const shiftInfoRows =
    params.shiftInfo === undefined
      ? []
      : Array.isArray(params.shiftInfo)
        ? params.shiftInfo
        : [params.shiftInfo]
  const pendingSampleRows = params.pendingSample ?? []
  const samplePositionRows = params.samplePosition ?? []

  const sheetNames = params.sheetNames ?? [
    'App_Data',
    'Shift_Info',
    'Pending_Sample',
    'Sample_Position',
  ]

  if (sheetNames.includes('App_Data')) {
    const headers = params.headers?.App_Data ?? REQUIRED_HANDOVER_SHEET_COLUMNS.App_Data
    XLSX.utils.book_append_sheet(workbook, rowsToSheet(headers, appDataRows), 'App_Data')
  }
  if (sheetNames.includes('Shift_Info')) {
    const headers = params.headers?.Shift_Info ?? REQUIRED_HANDOVER_SHEET_COLUMNS.Shift_Info
    XLSX.utils.book_append_sheet(workbook, rowsToSheet(headers, shiftInfoRows), 'Shift_Info')
  }
  if (sheetNames.includes('Pending_Sample')) {
    const headers = params.headers?.Pending_Sample ?? REQUIRED_HANDOVER_SHEET_COLUMNS.Pending_Sample
    XLSX.utils.book_append_sheet(
      workbook,
      rowsToSheet(headers, pendingSampleRows),
      'Pending_Sample',
    )
  }
  if (sheetNames.includes('Sample_Position')) {
    const headers =
      params.headers?.Sample_Position ?? REQUIRED_HANDOVER_SHEET_COLUMNS.Sample_Position
    XLSX.utils.book_append_sheet(
      workbook,
      rowsToSheet(headers, samplePositionRows),
      'Sample_Position',
    )
  }

  for (const [sheetName, rows] of Object.entries(params.extraSheets ?? {})) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...rows]), sheetName)
  }

  const written = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return written
}
