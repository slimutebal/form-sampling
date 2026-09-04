import type { GoogleSheetsTransport, ShiftSummaryRemoteWriter } from '@/application/google/google-ports'
import type { ShiftSummary } from '@/application/google/shift-summary'
import type { DomainError, Result } from '@/domain/common/result'
import {
  cellText,
  GOOGLE_SHIFT_SUMMARY_HEADER_RANGE,
  GOOGLE_SHIFT_SUMMARY_HEADERS,
  GOOGLE_SHIFT_SUMMARY_ID_COLUMN_RANGE,
  GOOGLE_SHIFT_SUMMARY_RANGE,
  GOOGLE_SHIFT_SUMMARY_SHEET_NAME,
  requireExactHeaderRow,
  type GoogleSheetsConfig,
} from './google-sheet-contract'

function buildSummaryRow(summary: ShiftSummary): readonly (string | number)[] {
  return [
    summary.shiftId,
    summary.date,
    summary.shiftCode,
    summary.sectorCode,
    summary.samplingHouseCode,
    summary.ritTotal,
    summary.batchTotal,
    summary.incrementTotal,
    summary.wrongTruckTotal,
  ]
}

export interface ShiftSummarySheetWriterDeps {
  readonly transport: GoogleSheetsTransport
  readonly config: GoogleSheetsConfig
}

/**
 * Google Sheets `Shift_Summary` upsert (ROADMAP Phase 16 §9/§14).
 * Never appends blindly — Shift_ID is the stable logical key: an
 * existing row for the same Shift_ID is updated in place, so a retried
 * sync for the same shift always leaves exactly one logical row. Never
 * computes rit/batch/increment/wrong-truck totals — `summary` is written
 * exactly as given.
 */
export class ShiftSummarySheetWriter implements ShiftSummaryRemoteWriter {
  private readonly transport: GoogleSheetsTransport
  private readonly config: GoogleSheetsConfig

  constructor(deps: ShiftSummarySheetWriterDeps) {
    this.transport = deps.transport
    this.config = deps.config
  }

  async upsertShiftSummary(summary: ShiftSummary): Promise<Result<void, DomainError>> {
    const headerResult = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_SHIFT_SUMMARY_HEADER_RANGE)
    if (!headerResult.ok) {
      return headerResult
    }
    const headerCheck = requireExactHeaderRow(
      headerResult.value.values,
      GOOGLE_SHIFT_SUMMARY_HEADERS,
      GOOGLE_SHIFT_SUMMARY_SHEET_NAME,
      'GOOGLE_SHIFT_SUMMARY_HEADER_MISMATCH',
    )
    if (!headerCheck.ok) {
      return headerCheck
    }

    const idColumnResult = await this.transport.getValues(
      this.config.spreadsheetId,
      GOOGLE_SHIFT_SUMMARY_ID_COLUMN_RANGE,
    )
    if (!idColumnResult.ok) {
      return idColumnResult
    }

    const shiftIdText = summary.shiftId as string
    const existingRowIndex = idColumnResult.value.values.findIndex((row) => cellText(row[0]) === shiftIdText)
    const rowValues = buildSummaryRow(summary)

    if (existingRowIndex >= 0) {
      // idColumnResult starts at sheet row 2 (A2:A), so data-row index 0 is sheet row 2.
      const rowNumber = existingRowIndex + 2
      return this.transport.updateValues(
        this.config.spreadsheetId,
        `${GOOGLE_SHIFT_SUMMARY_SHEET_NAME}!A${rowNumber}:I${rowNumber}`,
        [rowValues],
      )
    }

    return this.transport.appendValues(this.config.spreadsheetId, GOOGLE_SHIFT_SUMMARY_RANGE, [rowValues])
  }
}
