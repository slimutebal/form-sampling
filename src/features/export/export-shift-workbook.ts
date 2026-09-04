import { systemClock } from '@/application/common/clock'
import { buildShiftExportFilename } from '@/application/export/build-shift-export-filename'
import { buildShiftExportSnapshot, type ShiftExportInput, type ShiftExportSnapshot } from '@/application/export/build-shift-export-snapshot'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

export interface ExportShiftWorkbookInput
  extends Omit<ShiftExportInput, 'applicationVersion' | 'clock'> {
  /** Defaults to the injected build-time app version (`__APP_VERSION__`) — overridable for tests/tooling. */
  readonly applicationVersion?: string
  /** Defaults to the real system clock — overridable for deterministic tests. */
  readonly clock?: ShiftExportInput['clock']
  /**
   * Defaults to the dynamically-imported `writeShiftExportWorkbookBytes`
   * (SheetJS-backed). Overridable so tests can force a writer failure
   * without mocking the dynamic import — never used outside tests/tooling.
   */
  readonly writeWorkbookBytes?: (snapshot: ShiftExportSnapshot) => ArrayBuffer
}

export interface ExportShiftWorkbookResult {
  readonly bytes: ArrayBuffer
  readonly filename: string
}

/**
 * The feature composition root for turning a Shift's already-persisted
 * domain state into a downloadable Phase 13 archive. Deliberately the
 * only place that wires the Excel integration (SheetJS,
 * `@/integrations/excel/shift-export-workbook-writer`) together with the
 * pure application-layer snapshot builder — dynamically imported so a
 * normal shift that never exports never loads the Excel module
 * (mirrors `@/features/handover/read-handover-file`). Domain and
 * application code never reach this file, and this file never mutates
 * any of its input collections (rule 11).
 *
 * Domain validation errors from `buildShiftExportSnapshot` are returned
 * unchanged. Anything that goes wrong loading or running the Excel
 * writer (a bad dynamic import, a SheetJS serialization failure) is
 * caught and converted to a stable `EXPORT_WORKBOOK_WRITE_FAILED`
 * error — this function must never reject outward for that failure
 * class, and never surfaces the raw `Error.message`, which may contain
 * environment-specific detail unfit for a domain error.
 */
export async function exportShiftWorkbook(
  input: ExportShiftWorkbookInput,
): Promise<Result<ExportShiftWorkbookResult, DomainError>> {
  const applicationVersion = input.applicationVersion ?? __APP_VERSION__
  // Resolved once so the App_Data.ExportTimestamp cell and the filename
  // stamp always agree, even when `clock` is the real system clock.
  const now = (input.clock ?? systemClock).now()
  const frozenClock = { now: () => now }

  const snapshotResult = buildShiftExportSnapshot({ ...input, applicationVersion, clock: frozenClock })
  if (!snapshotResult.ok) {
    return snapshotResult
  }

  let bytes: ArrayBuffer
  try {
    const writeWorkbookBytes =
      input.writeWorkbookBytes ??
      (await import('@/integrations/excel/shift-export-workbook-writer')).writeShiftExportWorkbookBytes
    bytes = writeWorkbookBytes(snapshotResult.value)
  } catch {
    return err({
      code: 'EXPORT_WORKBOOK_WRITE_FAILED',
      message: 'Failed to write the shift export workbook',
    })
  }

  const filename = buildShiftExportFilename(input.shift.id, now)

  return ok({ bytes, filename })
}
