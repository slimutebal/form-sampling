import { parseOreCode } from '../common/codes'
import { parsePileId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { parseBatchNumber } from '../batch/batch-number'
import { createPendingBatch, type PendingBatch } from '../batch/pending-batch'
import { PENDING_STATUSES, type PendingStatus } from '../batch/pending-status'
import { parseRitNumber } from '../batch/rit-number'
import { createPile, type Pile } from '../pile/pile'

/**
 * One untrusted `Pending_Sample` sheet row (ARCHITECTURE.md §9.3):
 * Pile_ID, Ore, Batch, Last_Rit, Status. `Last_Increment` is deliberately
 * not modeled — increment is always derived by the sampling engine
 * (BR-SAMPLE-003), never carried over as raw archived data.
 */
export interface RawPendingBatchRow {
  readonly Pile_ID?: unknown
  readonly Ore?: unknown
  readonly Batch?: unknown
  readonly Last_Rit?: unknown
  readonly Status?: unknown
}

/** One reconstructed pile/pending-batch pair from a Pending_Sample row (BR-PEND-002/003). */
export interface PendingBatchCarryOver {
  readonly pile: Pile
  readonly pendingBatch: PendingBatch
}

function isPendingStatus(value: string): value is PendingStatus {
  return (PENDING_STATUSES as readonly string[]).includes(value)
}

/**
 * Validates and reconstructs one Pending_Sample row. Rule 7: the Pile's
 * Ore comes only from this row's own `Ore` column — the domain never
 * invents a Pile → Ore mapping when the archive does not supply one, so
 * a blank/invalid Ore is rejected here (MALFORMED_PILE_ORE) rather than
 * defaulted or looked up elsewhere.
 */
export function parsePendingBatchRow(raw: RawPendingBatchRow): Result<PendingBatchCarryOver, DomainError> {
  const pileIdResult = parsePileId(typeof raw.Pile_ID === 'string' ? raw.Pile_ID : '')
  if (!pileIdResult.ok) {
    return pileIdResult
  }

  const rawOre = raw.Ore
  if (typeof rawOre !== 'string' || rawOre.trim().length === 0) {
    return err({
      code: 'MALFORMED_PILE_ORE',
      message: `Pending_Sample row for Pile ${pileIdResult.value} has no Ore — a Pile-to-Ore mapping cannot be invented`,
    })
  }
  const oreCodeResult = parseOreCode(rawOre)
  if (!oreCodeResult.ok) {
    return err({
      code: 'MALFORMED_PILE_ORE',
      message: `Pending_Sample row for Pile ${pileIdResult.value} has an invalid Ore value`,
    })
  }

  const rawBatch = raw.Batch
  const batchNumberResult = parseBatchNumber(typeof rawBatch === 'number' ? rawBatch : Number(rawBatch))
  if (!batchNumberResult.ok) {
    return batchNumberResult
  }

  const rawLastRit = raw.Last_Rit
  const lastRitResult = parseRitNumber(typeof rawLastRit === 'number' ? rawLastRit : Number(rawLastRit))
  if (!lastRitResult.ok) {
    return lastRitResult
  }

  const rawStatus = raw.Status
  if (typeof rawStatus !== 'string' || !isPendingStatus(rawStatus)) {
    return err({
      code: 'INVALID_PENDING_STATUS',
      message: `Pending_Sample row for Pile ${pileIdResult.value} has an unrecognized Status`,
    })
  }

  const pile = createPile(pileIdResult.value, oreCodeResult.value)
  const pendingBatch = createPendingBatch({
    pileId: pile.id,
    batchNumber: batchNumberResult.value,
    lastRit: lastRitResult.value,
    status: rawStatus,
  })

  return ok({ pile, pendingBatch })
}

/**
 * Parses every Pending_Sample row, failing on the first invalid row
 * rather than silently dropping it (rule 7: "Reject incomplete
 * carry-over rather than guessing").
 */
export function parsePendingBatchRows(rows: readonly RawPendingBatchRow[]): Result<PendingBatchCarryOver[], DomainError> {
  const results: PendingBatchCarryOver[] = []
  for (const row of rows) {
    const parsed = parsePendingBatchRow(row)
    if (!parsed.ok) {
      return parsed
    }
    results.push(parsed.value)
  }
  return ok(results)
}

/**
 * Only CONTINUE becomes active carry-over (BR-PEND-001, rule 4). HOLD
 * rows are preserved in the full carry-over list returned by
 * `parsePendingBatchRows` but must never be included in the set that
 * feeds active batch continuation (`@/domain/batch/batch-engine`
 * `planContinuations`).
 */
export function selectActiveContinuationBatches(
  rows: readonly PendingBatchCarryOver[],
): readonly PendingBatchCarryOver[] {
  return rows.filter((row) => row.pendingBatch.status === 'CONTINUE')
}

/** Distinct Piles among the CONTINUE rows only — HOLD-only piles are preserved but not "active carry-over" (rule 4). */
export function selectActiveCarryOverPiles(rows: readonly PendingBatchCarryOver[]): readonly Pile[] {
  const active = selectActiveContinuationBatches(rows)
  const seen = new Set<string>()
  const piles: Pile[] = []
  for (const row of active) {
    if (seen.has(row.pile.id)) continue
    seen.add(row.pile.id)
    piles.push(row.pile)
  }
  return piles
}
