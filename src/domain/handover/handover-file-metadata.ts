import type { ShiftId } from '../common/identifiers'
import { parseShiftId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { HANDOVER_FILE_TYPE, isSupportedHandoverSchemaVersion, type HandoverSchemaVersion } from './handover-schema'

/**
 * Untrusted `App_Data` sheet content, already reduced from its Key/Value
 * rows to a flat object by the Excel integration layer (never SheetJS
 * types themselves — this module must stay import-free of `xlsx`).
 */
export interface RawHandoverFileMetadata {
  readonly FileType?: unknown
  readonly SchemaVersion?: unknown
  readonly Shift_ID?: unknown
  readonly ExportTimestamp?: unknown
}

/**
 * Validated `App_Data` metadata (ARCHITECTURE.md §9.4). `shiftId` here is
 * the *previous* (source) shift's id — the shift that produced this
 * archive, not the shift importing it.
 */
export interface HandoverFileMetadata {
  readonly fileType: string
  readonly schemaVersion: HandoverSchemaVersion
  readonly shiftId: ShiftId
  readonly exportTimestamp: string | undefined
}

/**
 * Validates the App_Data sheet (Import Validation step 1 — ARCHITECTURE.md
 * §12: "File type valid", "Schema version supported"). Fails explicitly
 * rather than defaulting a missing/wrong value:
 *  - UNRECOGNIZED_FILE_TYPE when FileType is missing or not
 *    HANDOVER_FILE_TYPE;
 *  - MISSING_SCHEMA_VERSION / UNSUPPORTED_SCHEMA_VERSION;
 *  - propagates parseShiftId's own error code for a missing/blank
 *    Shift_ID.
 */
export function parseHandoverFileMetadata(raw: RawHandoverFileMetadata): Result<HandoverFileMetadata, DomainError> {
  if (typeof raw.FileType !== 'string' || raw.FileType !== HANDOVER_FILE_TYPE) {
    return err({
      code: 'UNRECOGNIZED_FILE_TYPE',
      message: `App_Data.FileType must be "${HANDOVER_FILE_TYPE}"`,
    })
  }

  const rawSchemaVersion = raw.SchemaVersion
  const schemaVersionNumber = typeof rawSchemaVersion === 'number' ? rawSchemaVersion : Number(rawSchemaVersion)
  if (rawSchemaVersion === undefined || rawSchemaVersion === null || !Number.isFinite(schemaVersionNumber)) {
    return err({
      code: 'MISSING_SCHEMA_VERSION',
      message: 'App_Data.SchemaVersion is required',
    })
  }
  if (!isSupportedHandoverSchemaVersion(schemaVersionNumber)) {
    return err({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `App_Data.SchemaVersion ${schemaVersionNumber} is not supported by this application version`,
    })
  }

  const rawShiftId = raw.Shift_ID
  const shiftIdResult = parseShiftId(typeof rawShiftId === 'string' ? rawShiftId : '')
  if (!shiftIdResult.ok) {
    return shiftIdResult
  }

  const rawExportTimestamp = raw.ExportTimestamp
  const exportTimestamp = typeof rawExportTimestamp === 'string' && rawExportTimestamp.trim().length > 0
    ? rawExportTimestamp
    : undefined

  return ok({
    fileType: raw.FileType,
    schemaVersion: schemaVersionNumber,
    shiftId: shiftIdResult.value,
    exportTimestamp,
  })
}
