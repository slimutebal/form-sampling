import * as XLSX from 'xlsx'
import type { Result } from '../../domain/common/result'
import { err, ok } from '../../domain/common/result'
import {
  REQUIRED_HANDOVER_SHEET_COLUMNS,
  REQUIRED_HANDOVER_SHEET_NAMES,
  type RequiredHandoverSheetName,
} from '../../domain/handover/handover-schema'
import type { RawHandoverWorkbook } from '../../domain/handover/raw-handover-workbook'

/**
 * Excel parsing lives here, in the integration layer, and only here.
 * Domain and application code must never import SheetJS directly (rule
 * 10) — everything this module hands back is a plain `Record<string,
 * unknown>`, never a SheetJS type.
 */

export interface WorkbookReadError {
  readonly code: string
  readonly message: string
}

function findMissingSheet(workbook: XLSX.WorkBook): string | undefined {
  return REQUIRED_HANDOVER_SHEET_NAMES.find((name) => workbook.Sheets[name] === undefined)
}

/**
 * Reads a sheet's header row structurally, independent of whether it has
 * any data rows below it — `header: 1` yields the raw row-1 cell values
 * rather than an object keyed by inferred headers, so a sheet with zero
 * data rows still reports the header row SheetJS actually wrote.
 */
function readHeaderRow(sheet: XLSX.WorkSheet): readonly string[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  const headerRow = rows[0]
  if (!Array.isArray(headerRow)) {
    return []
  }
  return headerRow.map((cell) => (typeof cell === 'string' ? cell.trim() : ''))
}

/**
 * Finds the first required sheet missing a required column, checked
 * against the header row itself rather than inferred from row values
 * (rule 7) — this is what catches an empty-but-mis-headed sheet that
 * `sheet_to_json`'s row-based reading alone would silently accept as
 * "no rows" instead of "wrong shape".
 */
function findMissingColumn(
  workbook: XLSX.WorkBook,
): { sheet: RequiredHandoverSheetName; column: string } | undefined {
  for (const sheetName of REQUIRED_HANDOVER_SHEET_NAMES) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      continue
    }
    const headers = new Set(readHeaderRow(sheet))
    const missingColumn = REQUIRED_HANDOVER_SHEET_COLUMNS[sheetName].find(
      (column) => !headers.has(column),
    )
    if (missingColumn) {
      return { sheet: sheetName, column: missingColumn }
    }
  }
  return undefined
}

/** Reduces the App_Data sheet's Key/Value rows (ARCHITECTURE.md §9.4) into a flat lookup object. */
function reduceKeyValueSheet(sheet: XLSX.WorkSheet): Record<string, unknown> {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined })
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.Key
    if (typeof key === 'string' && key.trim().length > 0) {
      result[key] = row.Value
    }
  }
  return result
}

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined })
}

/**
 * Parses previous-shift archive bytes into the raw, still-untrusted
 * per-sheet shape the application layer validates (rule 2/3). Never
 * evaluates Excel formulas as application logic (TECH_STACK.md §32) —
 * only reads already-computed cell values via `sheet_to_json`.
 */
export function readHandoverWorkbookFromBytes(
  bytes: ArrayBuffer,
): Result<RawHandoverWorkbook, WorkbookReadError> {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, { type: 'array' })
  } catch {
    return err({
      code: 'UNREADABLE_FILE',
      message: 'The selected file could not be read as an Excel workbook',
    })
  }

  const missingSheet = findMissingSheet(workbook)
  if (missingSheet) {
    return err({
      code: 'MISSING_REQUIRED_SHEET',
      message: `Required sheet "${missingSheet}" is missing from the workbook`,
    })
  }

  const missingColumn = findMissingColumn(workbook)
  if (missingColumn) {
    return err({
      code: 'MISSING_REQUIRED_COLUMN',
      message: `Sheet "${missingColumn.sheet}" is missing required column "${missingColumn.column}"`,
    })
  }

  const appDataSheet = workbook.Sheets.App_Data
  const shiftInfoSheet = workbook.Sheets.Shift_Info
  const pendingSampleSheet = workbook.Sheets.Pending_Sample
  const samplePositionSheet = workbook.Sheets.Sample_Position
  if (!appDataSheet || !shiftInfoSheet || !pendingSampleSheet || !samplePositionSheet) {
    // Defensive — findMissingSheet already guarantees this cannot happen,
    // but this keeps TypeScript's narrowing sound without a non-null
    // assertion.
    return err({
      code: 'MISSING_REQUIRED_SHEET',
      message: 'A required sheet is missing from the workbook',
    })
  }

  const shiftInfoRows = sheetToRows(shiftInfoSheet)
  if (shiftInfoRows.length > 1) {
    return err({
      code: 'MULTIPLE_SHIFT_INFO_ROWS',
      message: `Shift_Info sheet must contain exactly one data row, found ${shiftInfoRows.length}`,
    })
  }

  return ok({
    appData: reduceKeyValueSheet(appDataSheet),
    shiftInfo: shiftInfoRows[0],
    pendingSample: sheetToRows(pendingSampleSheet),
    samplePosition: sheetToRows(samplePositionSheet),
  })
}
