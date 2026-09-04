import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { selectActiveCarryOverPiles, selectActiveContinuationBatches } from '@/domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '@/domain/handover/carry-over-pending-sample'
import type { ExpectedPreviousShift, PreviousShiftRelationshipCheck } from '@/domain/handover/expected-previous-shift'
import { checkPreviousShiftRelationship } from '@/domain/handover/expected-previous-shift'
import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'
import type { Pile } from '@/domain/pile/pile'
import { parseHandoverArchive, type ParsedHandoverArchive } from './parse-handover-archive'
import type { HandoverImportStore } from './handover-import-store'

export interface PreviewHandoverImportParams {
  readonly raw: RawHandoverWorkbook
  readonly fingerprint: string
  readonly expectedPreviousShift: ExpectedPreviousShift
  readonly store: HandoverImportStore
}

export interface HandoverImportPreview {
  readonly archive: ParsedHandoverArchive
  readonly fingerprint: string
  readonly relationshipCheck: PreviousShiftRelationshipCheck
  /** CONTINUE-only rows — what will become active carry-over on confirm (rule 4). */
  readonly activePendingBatches: readonly PendingBatchCarryOver[]
  readonly activeCarryOverPiles: readonly Pile[]
  readonly pendingSamples: readonly HandoverPendingSample[]
}

/** A minimal error shape shared by domain parse errors and store errors — only `code` is presentation-relevant. */
export interface HandoverImportError {
  readonly code: string
}

/**
 * Validates a raw handover workbook and reconstructs its carry-over
 * state as a read-only preview (rule 3, UI_UX_SPEC.md §20-21) — nothing
 * is persisted here, including this function's own duplicate-import
 * check: `hasImportedFingerprint` is a best-effort, early, read-only
 * check for fast UI feedback, not the authoritative guard (see
 * `HandoverImportStore`'s doc comment) — a fingerprint can still race
 * and only becomes durably consumed later, atomically with the Shift
 * workspace write. A previous-shift mismatch is not rejected here — it
 * is surfaced via `relationshipCheck` for the caller (UI) to warn about;
 * `confirmHandoverImport` unconditionally blocks finalizing on a
 * mismatch, with no override.
 */
export async function previewHandoverImport(
  params: PreviewHandoverImportParams,
): Promise<Result<HandoverImportPreview, HandoverImportError>> {
  const archiveResult = parseHandoverArchive(params.raw)
  if (!archiveResult.ok) {
    return archiveResult
  }
  const archive = archiveResult.value

  const alreadyImported = await params.store.hasImportedFingerprint(params.fingerprint)
  if (!alreadyImported.ok) {
    return alreadyImported
  }
  if (alreadyImported.value) {
    return err({ code: 'DUPLICATE_IMPORT' })
  }

  const relationshipCheck = checkPreviousShiftRelationship(archive.shiftInfo, params.expectedPreviousShift)

  return ok({
    archive,
    fingerprint: params.fingerprint,
    relationshipCheck,
    activePendingBatches: selectActiveContinuationBatches(archive.pendingBatches),
    activeCarryOverPiles: selectActiveCarryOverPiles(archive.pendingBatches),
    pendingSamples: archive.pendingSamples,
  })
}
