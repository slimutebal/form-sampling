import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'

/** Validates a proposed mutation without rejecting readable legacy snapshots. */
export function validateFleetDestinationMaterials(masterData: MasterData, pileIds: readonly string[]): Result<string | undefined, DomainError> {
  if (new Set(pileIds).size !== pileIds.length) {
    return err({ code: 'FLEET_DESTINATION_DUPLICATE', message: 'A Fleet cannot contain the same destination Pile more than once' })
  }
  let material: string | undefined
  for (const pileId of pileIds) {
    const pile = masterData.pileAreas.find((candidate) => candidate.pileId === pileId)
    if (!pile) return err({ code: 'FLEET_DESTINATION_PILE_NOT_FOUND', message: `Destination Pile_ID ${pileId} was not found in master data` })
    const next = String(pile.oreCode ?? '').trim()
    if (!next) return err({ code: 'FLEET_DESTINATION_MATERIAL_UNKNOWN', message: `Pile ${pileId} has no canonical Material Type in master data` })
    if (material && material !== next) return err({ code: 'FLEET_DESTINATION_MATERIAL_MISMATCH', message: `A Fleet cannot combine ${material} and ${next} destination Piles` })
    material = next
  }
  return ok(material)
}
