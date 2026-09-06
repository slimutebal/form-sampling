import type { HaulerCode } from '../master/master-codes'
import type { SectorCode } from '../common/codes'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FrontId, PileId } from '../common/identifiers'
import { parseFrontId } from '../common/identifiers'

const MIN_FRONT_NUMBER = 1
const MAX_FRONT_NUMBER = 25

/**
 * Builds the FrontId `createFrontDefinition` requires (BR-FLEET-001):
 * `Sector + "/" + two-digit Front Number`, e.g. `BR1` + `1` → `BR1/01`.
 * The operator only ever picks a Front Number 1–25 (Phase 18 §5) — the
 * combined code is always derived here, never typed manually.
 */
export function createFrontId(sectorCode: SectorCode, frontNumber: number): Result<FrontId, DomainError> {
  if (!Number.isInteger(frontNumber) || frontNumber < MIN_FRONT_NUMBER || frontNumber > MAX_FRONT_NUMBER) {
    return err({
      code: 'FRONT_NUMBER_OUT_OF_RANGE',
      message: `Front number must be an integer from ${MIN_FRONT_NUMBER} to ${MAX_FRONT_NUMBER}, got ${frontNumber}`,
    })
  }
  return parseFrontId(`${sectorCode}/${String(frontNumber).padStart(2, '0')}`)
}

/**
 * Minimal Front domain model (BR-FLEET-002). Deliberately excludes the
 * legacy display format `Sector + "/" + two-digit front number`
 * (BR-FLEET-001) as a core domain field — see `createFrontId` above,
 * which derives it. FrontId itself is the stable domain identifier.
 *
 * `destinationPileId` (Phase 18 §5) is the Excel `Fleet_Det` destination
 * concept — optional so every pre-Phase-18 fixture/test that builds a
 * FrontDefinition without one keeps compiling; a Front legitimately may
 * have no configured destination.
 *
 * Also deliberately excludes stockpile, timestamps, shift transaction
 * fields, fleet state, and operator/user assignment — none of those are
 * confirmed as part of the Front concept itself.
 */
export interface FrontDefinition {
  readonly frontId: FrontId
  readonly sectorCode: SectorCode
  readonly haulerCode: HaulerCode
  readonly destinationPileId?: PileId
}

export function createFrontDefinition(
  frontId: FrontId,
  sectorCode: SectorCode,
  haulerCode: HaulerCode,
  destinationPileId?: PileId,
): FrontDefinition {
  return { frontId, sectorCode, haulerCode, destinationPileId }
}

/**
 * Extracts the numeric Front Number out of a FrontId's `Sector/NN`
 * format (the inverse of `createFrontId`'s formatting half). Shared by
 * every active-shift "auto-assign the next Front Number for this
 * Sector" call site (`appendFrontContinuation`, `appendNewBaseFront`) so
 * the `Sector/NN` parsing rule is never duplicated.
 */
export function frontNumberFromFrontId(frontId: FrontId): number {
  const [, numberPart] = (frontId as string).split('/')
  return Number(numberPart)
}

/**
 * The next Front Number for a Sector during an active shift: existing
 * Front Number MAX + 1, never the first available gap — Front No reflects
 * chronological operational sequence (a moved loading point is a new
 * Front, not a reuse of a retired number). `FRONT_NUMBER_LIMIT_REACHED`
 * once the maximum (25) is already in use.
 */
export function nextFrontNumber(existingNumbers: readonly number[]): Result<number, DomainError> {
  const max = existingNumbers.length === 0 ? 0 : Math.max(...existingNumbers)
  if (max >= MAX_FRONT_NUMBER) {
    return err({
      code: 'FRONT_NUMBER_LIMIT_REACHED',
      message: `Front number limit of ${MAX_FRONT_NUMBER} has already been reached`,
    })
  }
  return ok(max + 1)
}
