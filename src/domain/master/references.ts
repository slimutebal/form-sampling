import type { OreCode, SamplingHouseCode, SectorCode } from '../common/codes'
import type { EmployeeId, PileId, TruckId } from '../common/identifiers'
import type { CrewCode, HaulerCode, LocationCode, PileAreaCode } from './master-codes'

/**
 * Minimal employee/staff master reference. `name` is included because
 * BR-MAN-001 confirms an NIK → Name lookup exists in the workbook.
 * No hierarchy, job title, or supervisor relationship is modeled here
 * (see §13 employee/crew modelling caution).
 */
export interface EmployeeReference {
  readonly id: EmployeeId
  readonly name: string
}

export function createEmployeeReference(id: EmployeeId, name: string): EmployeeReference {
  return { id, name }
}

/**
 * Crew master reference (Phase 16 real contract: `Crew_ID | Name | Job`).
 * `jobCode` is a plain, language-neutral string — no closed enum is
 * invented, since no confirmed business rule defines the set of jobs —
 * and is optional because the Google source column may be blank.
 */
export interface CrewReference {
  readonly code: CrewCode
  readonly name: string
  readonly jobCode?: string
}

export function createCrewReference(code: CrewCode, name: string, jobCode?: string): CrewReference {
  return { code, name, jobCode }
}

/** Minimal sector master reference (`Sector`). */
export interface SectorReference {
  readonly code: SectorCode
}

export function createSectorReference(code: SectorCode): SectorReference {
  return { code }
}

/** Minimal location master reference (`Location`). */
export interface LocationReference {
  readonly code: LocationCode
}

export function createLocationReference(code: LocationCode): LocationReference {
  return { code }
}

/**
 * Sampling-house master reference. Phase 16 real source data proves
 * `Sampling_House_Code` is NOT globally unique — the same code (e.g.
 * `SH_01`) can belong to different sectors — so `sectorCode` is part of
 * the reference itself, and logical uniqueness is Sector + Sampling
 * House, never the house code alone.
 */
export interface SamplingHouseReference {
  readonly sectorCode: SectorCode
  readonly code: SamplingHouseCode
}

export function createSamplingHouseReference(sectorCode: SectorCode, code: SamplingHouseCode): SamplingHouseReference {
  return { sectorCode, code }
}

/**
 * Pile-area master reference (Phase 16 real contract: `Sector_Code |
 * Stockpile_Code | Pile_ID | Ore`). `stockpileCode` maps to the
 * pre-existing `PileAreaCode` concept and is deliberately NOT unique —
 * many piles share one stockpile. `pileId` (reusing the shared `PileId`
 * identifier, distinct from a Pile domain instance) IS globally unique
 * within MasterData.
 */
export interface PileAreaReference {
  readonly sectorCode: SectorCode
  readonly stockpileCode: PileAreaCode
  readonly pileId: PileId
  readonly oreCode: OreCode
}

export function createPileAreaReference(
  sectorCode: SectorCode,
  stockpileCode: PileAreaCode,
  pileId: PileId,
  oreCode: OreCode,
): PileAreaReference {
  return { sectorCode, stockpileCode, pileId, oreCode }
}

/**
 * Hauler master reference (`Hauler_Code | Name`). `name` defaults to an
 * empty string so existing fleet/haulage test fixtures that only care
 * about `code` are unaffected by this Phase 16 addition.
 */
export interface HaulerReference {
  readonly code: HaulerCode
  readonly name: string
}

export function createHaulerReference(code: HaulerCode, name: string = ''): HaulerReference {
  return { code, name }
}

/**
 * Truck master reference tying a truck to its hauler category
 * (BR-MASTER-003, §3). Front/fleet assignment, effective fleet, and
 * truck validation belong to Phase 5 and are not modeled here.
 */
export interface TruckReference {
  readonly id: TruckId
  readonly haulerCode: HaulerCode
}

export function createTruckReference(id: TruckId, haulerCode: HaulerCode): TruckReference {
  return { id, haulerCode }
}
