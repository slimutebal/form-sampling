/**
 * Excel handover archive contract constants (ARCHITECTURE.md §9.4,
 * ROADMAP.md Phase 12). `App_Data.FileType` identifies the archive as a
 * Form Sampling shift export — any other value means the file is not
 * recognized at all, regardless of its `.xlsx` extension (TECH_STACK.md
 * §92: a `.xlsx` extension alone is not trusted).
 */
export const HANDOVER_FILE_TYPE = 'FORM_SAMPLING_SHIFT'

/**
 * Schema versions this build knows how to read. Deliberately a short,
 * explicit allow-list — an unrecognized version (older or newer) is
 * rejected rather than guessed at (ARCHITECTURE.md §12). Version 2 (Phase
 * 22) extended `Haulage_Detail` with Original/Effective columns and added
 * the `Production_Correction` sheet — neither is part of the required
 * import contract (`REQUIRED_HANDOVER_SHEET_NAMES`/`_COLUMNS` below are
 * unchanged), so version 1 archives remain fully importable; `[0]` is the
 * version this build now exports (see `EXPORT_SCHEMA_VERSION`).
 */
export const SUPPORTED_HANDOVER_SCHEMA_VERSIONS = [2, 1] as const

export type HandoverSchemaVersion = (typeof SUPPORTED_HANDOVER_SCHEMA_VERSIONS)[number]

export function isSupportedHandoverSchemaVersion(value: number): value is HandoverSchemaVersion {
  return (SUPPORTED_HANDOVER_SCHEMA_VERSIONS as readonly number[]).includes(value)
}

/** Required sheet names of the handover archive contract (ARCHITECTURE.md §9). */
export const REQUIRED_HANDOVER_SHEET_NAMES = [
  'App_Data',
  'Shift_Info',
  'Pending_Sample',
  'Sample_Position',
] as const

export type RequiredHandoverSheetName = (typeof REQUIRED_HANDOVER_SHEET_NAMES)[number]

/**
 * Required column headers per sheet (ARCHITECTURE.md §9). Checked
 * structurally against the sheet's header row — including when the sheet
 * has zero data rows — rather than inferred from row values, so a sheet
 * with the right shape but no rows is never mistaken for one missing a
 * required column, and a sheet missing a column is never guessed at from
 * whatever values happen to be present (rule 7).
 */
export const REQUIRED_HANDOVER_SHEET_COLUMNS: Readonly<
  Record<RequiredHandoverSheetName, readonly string[]>
> = {
  App_Data: ['Key', 'Value'],
  Shift_Info: ['Shift_ID', 'Date', 'Shift', 'Sector', 'Location'],
  Pending_Sample: ['Pile_ID', 'Ore', 'Batch', 'Last_Rit', 'Status'],
  Sample_Position: ['Pile_ID', 'Ore', 'Batch', 'Rit_From', 'Rit_To', 'Status'],
}
