import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { findPileArea, type MasterData } from '@/domain/master/master-data'
import { createPile, type Pile } from '@/domain/pile/pile'

export interface DeriveActivePilesParams {
  readonly carryOverPiles: readonly Pile[]
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
}

/**
 * Builds the Pile list a new Shift workspace is initialized with (Phase
 * 18 §7), merging two — and only two — sources at initialization time:
 * handover carry-over piles (already resolved by
 * `deriveShiftWorkspacePiles`) and every Fleet Setup Front's configured
 * Destination/Pile (§5), resolved against MasterData so its Ore always
 * comes from the master, never retyped. Deduplicated by PileId,
 * carry-over first — a carry-over Pile's own carried Ore always wins over
 * a Fleet destination pointing at the same Pile_ID.
 *
 * New Pile Master creations (§6) and the existing manual "Add Pile" flow
 * both land in `workspace.piles` via their own dedicated store methods
 * AFTER this initial set — they are not inputs to this function, since it
 * only concerns what is already known before `initializeShiftWorkspace`
 * runs.
 */
export function deriveActivePiles(params: DeriveActivePilesParams): readonly Pile[] {
  const byId = new Map<string, Pile>()

  for (const pile of params.carryOverPiles) {
    if (!byId.has(pile.id)) {
      byId.set(pile.id, pile)
    }
  }

  for (const front of params.fleetSetup.fronts) {
    if (!front.destinationPileId || byId.has(front.destinationPileId)) {
      continue
    }
    const pileArea = findPileArea(params.masterData, front.destinationPileId)
    if (!pileArea) {
      continue
    }
    byId.set(pileArea.pileId, createPile(pileArea.pileId, pileArea.oreCode))
  }

  return [...byId.values()]
}
