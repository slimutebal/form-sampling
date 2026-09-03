import type { HaulerCode } from '../master/master-codes'
import type { SectorCode } from '../common/codes'
import type { FrontId } from '../common/identifiers'

/**
 * Minimal Front domain model (BR-FLEET-002). Deliberately excludes the
 * legacy display format `Sector + "/" + two-digit front number`
 * (BR-FLEET-001) — that is a presentation/import-layer concern, not a
 * core domain field. FrontId is the stable domain identifier.
 *
 * Also deliberately excludes destination, stockpile, timestamps, shift
 * transaction fields, fleet state, and operator/user assignment — none
 * of those are confirmed as part of the Front concept itself.
 */
export interface FrontDefinition {
  readonly frontId: FrontId
  readonly sectorCode: SectorCode
  readonly haulerCode: HaulerCode
}

export function createFrontDefinition(
  frontId: FrontId,
  sectorCode: SectorCode,
  haulerCode: HaulerCode,
): FrontDefinition {
  return { frontId, sectorCode, haulerCode }
}
