import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import {
  parsePendingBatchRows,
  type PendingBatchCarryOver,
} from '@/domain/handover/carry-over-pending-batch'
import {
  parseSamplePositionCarryOverRows,
  type HandoverPendingSample,
} from '@/domain/handover/carry-over-pending-sample'
import { parseHandoverFileMetadata, type HandoverFileMetadata } from '@/domain/handover/handover-file-metadata'
import { parseHandoverShiftInfo, type HandoverShiftInfo } from '@/domain/handover/handover-shift-info'
import { validateArchivePileOreConsistency } from '@/domain/handover/pile-ore-consistency'
import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'

/** Fully validated handover archive content — carry-over state plus the previous shift's own identity. */
export interface ParsedHandoverArchive {
  readonly metadata: HandoverFileMetadata
  readonly shiftInfo: HandoverShiftInfo
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly pendingSamples: readonly HandoverPendingSample[]
}

/**
 * Validates and reconstructs a raw handover workbook (rules 2/3/7): file
 * metadata, previous-shift identity, every Pending_Sample row (BR-PEND-
 * 002/003), and every carry-over pending sample from Sample_Position
 * (BR-UND-001, rule 6). Fails on the very first invalid piece — a
 * partially-valid archive is never partially imported (rule 7).
 *
 * Also enforces two archive-level internal-consistency checks, neither
 * of which normalizes or picks a side/value on conflict:
 *  - App_Data.Shift_ID and Shift_Info.Shift_ID agree
 *    (`HANDOVER_SHIFT_ID_MISMATCH` if not);
 *  - every PileId resolves to exactly one OreCode across Pending_Sample
 *    and carried-over Sample_Position rows
 *    (`HANDOVER_PILE_ORE_CONFLICT` if not — see
 *    `validateArchivePileOreConsistency`).
 */
export function parseHandoverArchive(raw: RawHandoverWorkbook): Result<ParsedHandoverArchive, DomainError> {
  const metadataResult = parseHandoverFileMetadata(raw.appData)
  if (!metadataResult.ok) {
    return metadataResult
  }

  if (!raw.shiftInfo) {
    return { ok: false, error: { code: 'MISSING_SHIFT_INFO_ROW', message: 'Shift_Info sheet has no data row' } }
  }
  const shiftInfoResult = parseHandoverShiftInfo(raw.shiftInfo)
  if (!shiftInfoResult.ok) {
    return shiftInfoResult
  }

  // Internal consistency check: App_Data.Shift_ID and Shift_Info.Shift_ID
  // must identify the same previous shift. This is deliberately not
  // normalized — neither side is treated as authoritative over the
  // other, and no fallback/default is chosen. A mismatch means the
  // archive itself is internally inconsistent (e.g. assembled from two
  // different exports), and the whole import is rejected rather than
  // guessed at (rule 7).
  if (metadataResult.value.shiftId !== shiftInfoResult.value.shiftId) {
    return {
      ok: false,
      error: {
        code: 'HANDOVER_SHIFT_ID_MISMATCH',
        message: `App_Data.Shift_ID (${metadataResult.value.shiftId}) does not match Shift_Info.Shift_ID (${shiftInfoResult.value.shiftId})`,
      },
    }
  }

  const pendingBatchesResult = parsePendingBatchRows(raw.pendingSample)
  if (!pendingBatchesResult.ok) {
    return pendingBatchesResult
  }

  const pendingSamplesResult = parseSamplePositionCarryOverRows(raw.samplePosition, metadataResult.value.shiftId)
  if (!pendingSamplesResult.ok) {
    return pendingSamplesResult
  }

  // Archive-level consistency check (runs only once every individual row
  // is already known-valid): the same PileId must resolve to exactly one
  // OreCode across every Pending_Sample row and every carried-over
  // NOT_PICKED_UP Sample_Position row. See
  // `validateArchivePileOreConsistency`'s doc comment for why a conflict
  // is rejected outright rather than resolved by picking a value.
  const pileOreConsistency = validateArchivePileOreConsistency(pendingBatchesResult.value, pendingSamplesResult.value)
  if (!pileOreConsistency.ok) {
    return pileOreConsistency
  }

  return ok({
    metadata: metadataResult.value,
    shiftInfo: shiftInfoResult.value,
    pendingBatches: pendingBatchesResult.value,
    pendingSamples: pendingSamplesResult.value,
  })
}
