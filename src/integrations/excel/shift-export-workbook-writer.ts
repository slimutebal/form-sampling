import * as XLSX from 'xlsx'
import type { ShiftExportSnapshot } from '@/application/export/build-shift-export-snapshot'
import { REQUIRED_HANDOVER_SHEET_COLUMNS } from '@/domain/handover/handover-schema'

/**
 * Excel serialization lives here, in the integration layer, and only
 * here (rule 11) — `@/application/export/build-shift-export-snapshot`
 * builds the plain `ShiftExportSnapshot` DTO with no SheetJS dependency;
 * this module's only job is turning it into workbook bytes.
 *
 * The four sheets the Phase 12 importer actually reads (`App_Data`,
 * `Shift_Info`, `Pending_Sample`, `Sample_Position`) reuse
 * `REQUIRED_HANDOVER_SHEET_COLUMNS` verbatim for their required leading
 * columns, so this writer can never drift out of sync with what
 * `readHandoverWorkbookFromBytes` requires (rule 1: no special-casing
 * needed to import an archive this module produces).
 */

const REPORT_HEADERS = ['Key', 'Value'] as const
const PILE_SUMMARY_HEADERS = [
  'Pile_ID',
  'Ore',
  'Haulage_Transaction_Count',
  'Sample_Position_Count',
  'Pending_Batch_Count',
] as const
const HAULAGE_DETAIL_HEADERS = [
  'Shift_ID',
  'Pile_ID',
  'Batch',
  'Rit',
  'Front_ID',
  'Fleet_ID',
  'Truck_ID',
  'Sample_Status',
  'Sample_Increment',
  'Truck_Status',
  'Wrong_Truck_Reasons',
] as const
const SAMPLING_DETAIL_HEADERS = [
  'Shift_ID',
  'Pile_ID',
  'Batch',
  'Rit',
  'Sample_Increment',
  'Front_ID',
  'Fleet_ID',
  'Truck_ID',
  'Truck_Status',
] as const
/** Required Sample_Position columns first, then additional stable columns already known as domain facts. */
const SAMPLE_POSITION_HEADERS = [
  ...REQUIRED_HANDOVER_SHEET_COLUMNS.Sample_Position,
  'Total_Bag',
  'Destination',
  'Dispatcher_Employee_ID',
] as const

/** Writes an explicit header row followed by data rows, so the header exists structurally even with zero data rows (mirrors the Phase 12 test workbook writer). */
function rowsToSheet(headers: readonly string[], rows: readonly Record<string, unknown>[]): XLSX.WorkSheet {
  const aoa: unknown[][] = [[...headers], ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
  return XLSX.utils.aoa_to_sheet(aoa)
}

function asRows<T>(rows: readonly T[]): readonly Record<string, unknown>[] {
  return rows as unknown as readonly Record<string, unknown>[]
}

/**
 * Serializes a `ShiftExportSnapshot` into immutable XLSX bytes (rule 12).
 * Sheet order follows the Phase 13 contract listing (ROADMAP.md §15).
 * Never evaluates or invents anything — every cell value was already
 * computed by `buildShiftExportSnapshot`.
 */
export function writeShiftExportWorkbookBytes(snapshot: ShiftExportSnapshot): ArrayBuffer {
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, rowsToSheet(REPORT_HEADERS, asRows(snapshot.report)), 'Report')
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(REQUIRED_HANDOVER_SHEET_COLUMNS.Shift_Info, asRows([snapshot.shiftInfo])),
    'Shift_Info',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(PILE_SUMMARY_HEADERS, asRows(snapshot.pileSummary)),
    'Pile_Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(HAULAGE_DETAIL_HEADERS, asRows(snapshot.haulageDetail)),
    'Haulage_Detail',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(SAMPLING_DETAIL_HEADERS, asRows(snapshot.samplingDetail)),
    'Sampling_Detail',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(SAMPLE_POSITION_HEADERS, asRows(snapshot.samplePosition)),
    'Sample_Position',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(REQUIRED_HANDOVER_SHEET_COLUMNS.Pending_Sample, asRows(snapshot.pendingSample)),
    'Pending_Sample',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    rowsToSheet(REQUIRED_HANDOVER_SHEET_COLUMNS.App_Data, asRows(snapshot.appData)),
    'App_Data',
  )

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
