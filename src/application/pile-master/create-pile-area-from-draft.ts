import type { SectorCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { deriveCanonicalPileArea } from '@/domain/master/canonical-pile-id'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import { createPileAreaReference, type PileAreaReference } from '@/domain/master/references'

/**
 * Editable form-level shape for the New Pile Master flow (post-inspection
 * correction §3). Only the Pile ID is entered — Sector, Stockpile, and
 * Ore are derived from its confirmed canonical naming grammar
 * (`deriveCanonicalPileArea`), never asked of the operator and never a
 * free-text/manual selection.
 */
export interface NewPileDraft {
  readonly pileId: string
}

/**
 * Pre-flight validation for a brand-new Pile_Areas row, before any network
 * call is attempted. This checks only the one new row — it does not
 * duplicate `createMasterData`'s full-catalog validation, which still runs
 * (and remains authoritative) when the merged master is rebuilt after a
 * successful remote write.
 *
 * Sector/Stockpile/Ore are derived, not entered: an unsupported/irregular
 * Pile_ID naming pattern is rejected (`PILE_ID_PATTERN_NOT_SUPPORTED`)
 * rather than falling back to a manual selector.
 */
export function createPileAreaFromDraft(
  draft: NewPileDraft,
  sectorCode: SectorCode,
  masterData: MasterData,
): Result<PileAreaReference, DomainError> {
  const pileId = parsePileId(draft.pileId)
  if (!pileId.ok) return pileId

  if (masterData.pileAreas.some((pileArea) => pileArea.pileId === pileId.value)) {
    return err({
      code: 'DUPLICATE_PILE_AREA_PILE_ID',
      message: `Pile_ID ${draft.pileId} already exists in master data`,
    })
  }

  const derived = deriveCanonicalPileArea(draft.pileId, sectorCode)
  if (!derived.ok) return derived

  if (!findOreSamplingConfig(masterData, derived.value.oreCode)) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${derived.value.oreCode}`,
    })
  }

  return ok(
    createPileAreaReference(derived.value.sectorCode, derived.value.stockpileCode, pileId.value, derived.value.oreCode),
  )
}
