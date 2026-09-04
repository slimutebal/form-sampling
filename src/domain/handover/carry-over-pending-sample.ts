import type { Brand } from '../common/brand'
import { parseOreCode, type OreCode } from '../common/codes'
import { parsePileId, type PileId, type ShiftId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { parseBatchNumber, type BatchNumber } from '../batch/batch-number'
import { parseRitNumber, type RitNumber } from '../batch/rit-number'

/**
 * One untrusted `Sample_Position` sheet row, as relevant to handover
 * (ARCHITECTURE.md §9, §5.6). `Status` here is the sample's delivery
 * status (`NOT_PICKED_UP` / `DELIVERED`), not PendingStatus.
 */
export interface RawSamplePositionCarryOverRow {
  readonly Pile_ID?: unknown
  readonly Ore?: unknown
  readonly Batch?: unknown
  readonly Rit_From?: unknown
  readonly Rit_To?: unknown
  readonly Status?: unknown
}

export interface HandoverPendingSampleData {
  readonly pileId: PileId
  readonly oreCode: OreCode
  readonly batchNumber: BatchNumber
  readonly ritFrom: RitNumber
  readonly ritTo: RitNumber
  readonly sourceShiftId: ShiftId
}

/**
 * A validated carry-over pending sample (BR-UND-001, ARCHITECTURE.md
 * §8.1 "sample belum delivered"). Branded so a raw object cannot be
 * assigned directly — the only way to obtain one is
 * `parseSamplePositionCarryOverRow`. Deliberately does not recompute a
 * sampled-Rit sequence or Total Bag against the *current* shift's
 * OreSamplingConfig (`@/domain/sample-handling/sample-range`) — that
 * recomputation belongs to the sample-handling engine once this carry-
 * over is actually acted on in the new shift; Phase 12 only reconstructs
 * the previous shift's own recorded range.
 */
export type HandoverPendingSample = Brand<HandoverPendingSampleData, 'HandoverPendingSample'>

const DELIVERY_STATUSES = ['NOT_PICKED_UP', 'DELIVERED'] as const

/**
 * Validates one Sample_Position row and reconstructs it as a carry-over
 * pending sample — but only when its delivery Status is NOT_PICKED_UP.
 * A DELIVERED row returns `ok(undefined)`: it is historical reference
 * only (ARCHITECTURE.md §8.2), already represented as a handled
 * SamplePosition in the previous shift, and must not be duplicated into
 * the new shift's pending sample list (rule 6).
 */
export function parseSamplePositionCarryOverRow(
  raw: RawSamplePositionCarryOverRow,
  sourceShiftId: ShiftId,
): Result<HandoverPendingSample | undefined, DomainError> {
  const rawStatus = raw.Status
  if (typeof rawStatus !== 'string' || !(DELIVERY_STATUSES as readonly string[]).includes(rawStatus)) {
    return err({
      code: 'INVALID_SAMPLE_DELIVERY_STATUS',
      message: 'Sample_Position row has an unrecognized delivery Status',
    })
  }

  if (rawStatus === 'DELIVERED') {
    return ok(undefined)
  }

  const pileIdResult = parsePileId(typeof raw.Pile_ID === 'string' ? raw.Pile_ID : '')
  if (!pileIdResult.ok) {
    return pileIdResult
  }

  const rawOre = raw.Ore
  if (typeof rawOre !== 'string' || rawOre.trim().length === 0) {
    return err({
      code: 'MALFORMED_PILE_ORE',
      message: `Sample_Position row for Pile ${pileIdResult.value} has no Ore — a Pile-to-Ore mapping cannot be invented`,
    })
  }
  const oreCodeResult = parseOreCode(rawOre)
  if (!oreCodeResult.ok) {
    return err({
      code: 'MALFORMED_PILE_ORE',
      message: `Sample_Position row for Pile ${pileIdResult.value} has an invalid Ore value`,
    })
  }

  const rawBatch = raw.Batch
  const batchNumberResult = parseBatchNumber(typeof rawBatch === 'number' ? rawBatch : Number(rawBatch))
  if (!batchNumberResult.ok) {
    return batchNumberResult
  }

  const rawRitFrom = raw.Rit_From
  const ritFromResult = parseRitNumber(typeof rawRitFrom === 'number' ? rawRitFrom : Number(rawRitFrom))
  if (!ritFromResult.ok) {
    return ritFromResult
  }

  const rawRitTo = raw.Rit_To
  const ritToResult = parseRitNumber(typeof rawRitTo === 'number' ? rawRitTo : Number(rawRitTo))
  if (!ritToResult.ok) {
    return ritToResult
  }

  if (Number(ritFromResult.value) > Number(ritToResult.value)) {
    return err({
      code: 'SAMPLE_RANGE_REVERSED',
      message: `Sample_Position row for Pile ${pileIdResult.value} has Rit_From greater than Rit_To`,
    })
  }

  const data: HandoverPendingSampleData = {
    pileId: pileIdResult.value,
    oreCode: oreCodeResult.value,
    batchNumber: batchNumberResult.value,
    ritFrom: ritFromResult.value,
    ritTo: ritToResult.value,
    sourceShiftId,
  }
  return ok(data as HandoverPendingSample)
}

/**
 * Parses every Sample_Position row relevant to handover, collecting only
 * the NOT_PICKED_UP rows as carry-over pending samples (DELIVERED rows
 * are silently omitted — see `parseSamplePositionCarryOverRow`). Fails
 * on the first malformed row (rule 7).
 */
export function parseSamplePositionCarryOverRows(
  rows: readonly RawSamplePositionCarryOverRow[],
  sourceShiftId: ShiftId,
): Result<HandoverPendingSample[], DomainError> {
  const results: HandoverPendingSample[] = []
  for (const row of rows) {
    const parsed = parseSamplePositionCarryOverRow(row, sourceShiftId)
    if (!parsed.ok) {
      return parsed
    }
    if (parsed.value !== undefined) {
      results.push(parsed.value)
    }
  }
  return ok(results)
}
