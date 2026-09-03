import type { OreCode } from '../common/codes'
import type { PileId } from '../common/identifiers'

/**
 * Minimal Pile domain model. Deliberately unbounded: the application
 * must support any number of piles, not the workbook's legacy
 * six-sheet (Pile_01..Pile_06) limitation.
 */
export interface Pile {
  readonly id: PileId
  readonly oreCode: OreCode
}

export function createPile(id: PileId, oreCode: OreCode): Pile {
  return { id, oreCode }
}
