import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { HandoverImportPreview, HandoverImportError } from './preview-handover-import'
import type { HandoverCarryOverState } from './handover-carry-over'

export interface ConfirmHandoverImportParams {
  readonly preview: HandoverImportPreview
}

/**
 * Finalizes a previously validated preview into carry-over state. Pure
 * and non-destructive — performs no I/O and writes nothing. Durable
 * persistence (both the import-history fingerprint record and the
 * carry-over state itself) happens later, in one atomic write, via
 * `LocalOperationalStore.initializeShiftWorkspace`'s `handoverImport`
 * parameter, once the new Shift actually exists. This keeps the
 * invariant that a fingerprint is never permanently consumed unless its
 * carry-over state was also durably persisted — see that module's
 * doc comment.
 *
 * A previous-shift relationship mismatch is an unconditional blocking
 * failure (`PREVIOUS_SHIFT_MISMATCH`) — there is no "continue anyway"
 * override. Business policy/authorization for overriding a mismatch is
 * not yet confirmed (BUSINESS_RULES.md has no such rule), so this
 * function must not offer one.
 */
export function confirmHandoverImport(
  params: ConfirmHandoverImportParams,
): Result<HandoverCarryOverState, HandoverImportError> {
  const { preview } = params

  if (!preview.relationshipCheck.matches) {
    return err({ code: 'PREVIOUS_SHIFT_MISMATCH' })
  }

  return ok({
    sourceShiftId: preview.archive.metadata.shiftId,
    fingerprint: preview.fingerprint,
    schemaVersion: preview.archive.metadata.schemaVersion,
    pendingBatches: preview.archive.pendingBatches,
    pendingSamples: preview.pendingSamples,
  })
}
