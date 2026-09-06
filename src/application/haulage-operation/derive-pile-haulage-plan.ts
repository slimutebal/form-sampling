import type { BatchPosition } from '@/domain/batch/batch-position'
import { createBatchPosition } from '@/domain/batch/batch-position'
import { planContinuations, remainingPositionsFromStart, type BatchContinuationSeed } from '@/domain/batch/batch-engine'
import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import { selectActiveContinuationBatches } from '@/domain/handover/carry-over-pending-batch'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
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
