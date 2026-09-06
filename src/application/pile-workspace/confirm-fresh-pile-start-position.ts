import type { DomainError, Result } from '@/domain/common/result'
import { err } from '@/domain/common/result'
import { parseFreshPileStartPosition, type FreshPileStartPosition } from '@/domain/pile/fresh-pile-start-position'

export interface ConfirmFreshPileStartPositionParams {
  readonly batchNumber: number
  readonly ritNumber: number
  /**
   * The count of haulage transactions already recorded for this Shift/
   * Pile — the caller (`PileHaulagePage`, which already loads this list)
   * passes it through rather than this pure function re-fetching it.
   */
  readonly existingTransactionCount: number
}

/**
 * Validates a supervisor/operator-confirmed fresh-pile starting position
 * (post-inspection correction §6). Reuses BatchNumber/RitNumber
 * validation — no new range rule. Once the first haulage transaction has
 * been saved for this Pile, the starting position is locked:
 * `FRESH_PILE_START_POSITION_LOCKED` rather than silently re-seeding a
 * pile that already has real progress recorded against it.
 */
export function confirmFreshPileStartPosition(
  params: ConfirmFreshPileStartPositionParams,
): Result<FreshPileStartPosition, DomainError> {
  if (params.existingTransactionCount > 0) {
    return err({
      code: 'FRESH_PILE_START_POSITION_LOCKED',
      message: 'Cannot change the confirmed starting position once haulage has been recorded for this pile',
    })
  }

  return parseFreshPileStartPosition(params.batchNumber, params.ritNumber)
}
