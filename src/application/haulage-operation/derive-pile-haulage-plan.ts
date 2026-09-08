import type { BatchNumber } from '@/domain/batch/batch-number'
import type { BatchPosition } from '@/domain/batch/batch-position'
import { createBatchPosition, createInitialBatchPosition } from '@/domain/batch/batch-position'
import {
  planContinuations,
  remainingPositionsForSeed,
  remainingPositionsFromStart,
  type BatchContinuationSeed,
} from '@/domain/batch/batch-engine'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { selectActiveContinuationBatches } from '@/domain/handover/carry-over-pending-batch'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { BatchSize } from '@/domain/master/sampling-config'
import type { FreshPileStartPosition } from '@/domain/pile/fresh-pile-start-position'
import type { Pile } from '@/domain/pile/pile'

/**
 * Builds the authoritative `expectedPositions` plan `PileHaulagePage`
 * (Phase 10) requires for one Pile (Phase 18 wiring correction §11),
 * composing only existing domain functions — never a new sampling/batch
 * rule. The workspace's own `pendingBatches` carry-over (Phase 12) is
 * the primary source of continuation seeds: its CONTINUE rows for this
 * Pile become `BatchContinuationSeed`s, and `planContinuations`
 * (`@/domain/batch/batch-engine`) turns them into the remaining
 * BatchPosition sequence.
 *
 * A Pile with no carry-over (a fresh Pile, no previous-shift history)
 * has no confirmed initial seed until `freshStartPosition` (post-
 * inspection correction §6, `pile.freshPileStartPosition`) is supplied —
 * `planContinuations([], ...)` returns an empty plan rather than
 * inventing a "Batch 1 / Rit 1" fallback on its own, exactly as
 * `@/application/haulage-operation/haulage-plan`'s own doc comment
 * requires; `freshStartPosition` is the caller's explicit, confirmed
 * answer to that question, never guessed here. The existing Phase 10
 * `deriveHaulageProgress` already handles an empty `expectedPositions`
 * array as a normal, translated `HAULAGE_PLAN_EMPTY` state (not a
 * crash) — this function does not need to special-case an unconfirmed
 * fresh pile beyond simply not supplying a plan for it.
 */
export function derivePileHaulagePlan(
  pile: Pile,
  masterData: MasterData,
  pendingBatches: readonly PendingBatchCarryOver[],
  freshStartPosition?: FreshPileStartPosition,
): Result<readonly BatchPosition[], DomainError> {
  const config = findOreSamplingConfig(masterData, pile.oreCode)
  if (!config) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${pile.oreCode}`,
    })
  }

  const activeForPile = selectActiveContinuationBatches(pendingBatches).filter(
    (row) => row.pile.id === pile.id,
  )

  if (activeForPile.length === 0 && freshStartPosition) {
    return remainingPositionsFromStart(
      createBatchPosition(freshStartPosition.batchNumber, freshStartPosition.ritNumber),
      config.batchSize,
    )
  }

  const seeds: BatchContinuationSeed[] = activeForPile.map((row) => ({
    batchNumber: row.pendingBatch.batchNumber,
    lastRit: row.pendingBatch.lastRit,
  }))

  return planContinuations(seeds, config.batchSize)
}

/**
 * The authoritative expected Rit numbers for one specific Batch of one
 * Pile (Phase 3 missed-Rit hardening) — the bounded operational range a
 * missed-Rit calculation must scan, never an invented `1..N` range.
 * Reuses the exact same batch-start resolution `derivePileHaulagePlan`
 * itself is built from, scoped to a single named BatchNumber instead of
 * "whatever the plan currently covers":
 *  1. a CONTINUE carry-over row for this Pile/BatchNumber
 *     (`selectActiveContinuationBatches`) — expected Rits start the
 *     position immediately after that row's `lastRit`
 *     (`remainingPositionsForSeed`), never from Rit 1;
 *  2. else, `freshStartPosition` when it names this exact BatchNumber —
 *     expected Rits start at its confirmed starting Rit
 *     (`remainingPositionsFromStart`), never from Rit 1;
 *  3. else, this Batch has no confirmed non-Rit-1 starting context at
 *     all, so it defaults to the ordinary Rit 1 start
 *     (`createInitialBatchPosition` + `remainingPositionsFromStart`) —
 *     this is the normal case for every Batch that was not itself
 *     handed over or explicitly fresh-started (e.g. a later Batch begun
 *     within the same shift).
 * `batchSize` is supplied by the caller (already resolved from
 * `OreSamplingConfig`) rather than re-looked-up here, so a caller that
 * already resolved it once (e.g. `deriveProductionBatchSummaries`) never
 * pays for or handles a second `ORE_SAMPLING_CONFIG_NOT_FOUND` path.
 */
export function deriveExpectedRitsForBatch(
  pile: Pile,
  batchSize: BatchSize,
  pendingBatches: readonly PendingBatchCarryOver[],
  batchNumber: BatchNumber,
  freshStartPosition?: FreshPileStartPosition,
): Result<readonly RitNumber[], DomainError> {
  const carryOverRow = selectActiveContinuationBatches(pendingBatches).find(
    (row) => row.pile.id === pile.id && Number(row.pendingBatch.batchNumber) === Number(batchNumber),
  )
  if (carryOverRow) {
    const positions = remainingPositionsForSeed(
      { batchNumber: carryOverRow.pendingBatch.batchNumber, lastRit: carryOverRow.pendingBatch.lastRit },
      batchSize,
    )
    if (!positions.ok) {
      return positions
    }
    return ok(positions.value.map((position) => position.ritNumber))
  }

  if (freshStartPosition && Number(freshStartPosition.batchNumber) === Number(batchNumber)) {
    const positions = remainingPositionsFromStart(
      createBatchPosition(freshStartPosition.batchNumber, freshStartPosition.ritNumber),
      batchSize,
    )
    if (!positions.ok) {
      return positions
    }
    return ok(positions.value.map((position) => position.ritNumber))
  }

  const positions = remainingPositionsFromStart(createInitialBatchPosition(batchNumber), batchSize)
  if (!positions.ok) {
    return positions
  }
  return ok(positions.value.map((position) => position.ritNumber))
}
