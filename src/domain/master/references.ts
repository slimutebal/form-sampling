import type { SamplingHouseCode, SectorCode } from '../common/codes'
import type { EmployeeId, TruckId } from '../common/identifiers'
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
 * Minimal crew master reference. No confirmed human-readable label
 * beyond the code exists in documentation, so only the code is
 * represented (§2 — prefer minimal confirmed structure).
 */
export interface CrewReference {
  readonly code: CrewCode
}

export function createCrewReference(code: CrewCode): CrewReference {
  return { code }
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
 * Minimal sampling-house master reference. No confirmed relationship
 * to a single Location is assumed (§2).
 */
export interface SamplingHouseReference {
  readonly code: SamplingHouseCode
}

export function createSamplingHouseReference(code: SamplingHouseCode): SamplingHouseReference {
  return { code }
}

/**
 * Minimal pile-area master reference (`Pile_area`). Deliberately
 * distinct from Pile / PileId (§2, §14 caution).
 */
export interface PileAreaReference {
  readonly code: PileAreaCode
}

export function createPileAreaReference(code: PileAreaCode): PileAreaReference {
  return { code }
}

/** Minimal hauler master reference (`Hauler_PT`). */
export interface HaulerReference {
  readonly code: HaulerCode
}

export function createHaulerReference(code: HaulerCode): HaulerReference {
  return { code }
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
