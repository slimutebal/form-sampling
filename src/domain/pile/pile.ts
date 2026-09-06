import type { OreCode } from '../common/codes'
import type { PileId } from '../common/identifiers'
import type { FreshPileStartPosition } from './fresh-pile-start-position'

/**
 * Minimal Pile domain model. Deliberately unbounded: the application
 * must support any number of piles, not the workbook's legacy
 * six-sheet (Pile_01..Pile_06) limitation.
 *
 * `freshPileStartPosition` (post-inspection correction §6) is optional
 * and only ever set for a genuinely fresh pile with no handover
 * carry-over — it is the operator/supervisor-confirmed starting
 * Batch/Rit, persisted so reload/offline does not lose it. It is a plain
 * optional field on this existing stored shape, not a new Dexie
 * table/index, so old stored piles without it remain readable.
 */
export interface Pile {
  readonly id: PileId
  readonly oreCode: OreCode
  readonly freshPileStartPosition?: FreshPileStartPosition
}

export function createPile(id: PileId, oreCode: OreCode, freshPileStartPosition?: FreshPileStartPosition): Pile {
  return { id, oreCode, freshPileStartPosition }
}
