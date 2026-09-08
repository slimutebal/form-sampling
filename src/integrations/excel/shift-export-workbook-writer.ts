import * as XLSX from 'xlsx'
import type { ShiftExportSnapshot } from '@/application/export/build-shift-export-snapshot'
import { REQUIRED_HANDOVER_SHEET_COLUMNS } from '@/domain/handover/handover-schema'
import { buildReportSheetAoa } from './report-sheet-writer'

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

const PILE_SUMMARY_HEADERS = [
  'Pile_ID',
  'Ore',
  'Haulage_Transaction_Count',
  'Sample_Position_Count',
  'Pending_Batch_Count',
] as const
/** Phase 22 §4: Original (immutable transaction) and Effective (current ProductionRecord state) columns side by side — original values are never replaced by effective ones. */
const HAULAGE_DETAIL_HEADERS = [
  'Transaction_ID',
  'Shift_ID',
  'Pile_ID',
  'Original_Batch',
  'Original_Rit',
  'Original_Front_ID',
  'Original_Fleet_ID',
  'Original_Truck_ID',
  'Effective_Batch',
  'Effective_Rit',
  'Effective_Front_ID',
  'Effective_Fleet_ID',
  'Effective_Truck_ID',
  'Physical_Condition',
  'Contamination',
  'Disposition',
  'Record_Status',
  'Remark',
  'Sample_Required_Original',
  'Sample_Required_Effective',
  'Truck_Status_Original',
  'Truck_Status_Effective',
  'Created_At',
  'Created_By',
  'Updated_At',
  'Updated_By',
  'Correction_Count',
] as const

/** Phase 22 §5: one row per ProductionCorrectionEvent, flattened across every ProductionRecord — an event log, not part of the required import contract. */
const PRODUCTION_CORRECTION_HEADERS = [
  'Correction_ID',
  'Transaction_ID',
  'Correction_Type',
  'Reason',
  'Corrected_At',
  'Corrected_By',
  'Before_Batch',
  'Before_Rit',
  'After_Batch',
  'After_Rit',
  'Before_Front_ID',
  'After_Front_ID',
  'Before_Truck_ID',
  'After_Truck_ID',
  'Before_Physical_Condition',
  'After_Physical_Condition',
  'Before_Contamination',
  'After_Contamination',
  'Before_Disposition',
  'After_Disposition',
  'Before_Status',
  'After_Status',
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

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildReportSheetAoa(snapshot.report)), 'Report')
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
    rowsToSheet(PRODUCTION_CORRECTION_HEADERS, asRows(snapshot.productionCorrection)),
    'Production_Correction',
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
