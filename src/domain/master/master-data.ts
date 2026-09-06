import type { Brand } from '../common/brand'
import type { OreCode } from '../common/codes'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { EmployeeId, PileId, TruckId } from '../common/identifiers'
import type { CrewCode } from './master-codes'
import type {
  CrewReference,
  EmployeeReference,
  HaulerReference,
  LocationReference,
  PileAreaReference,
  SamplingHouseReference,
  SectorReference,
  TruckReference,
} from './references'
import type { OreSamplingConfig } from './sampling-config'

/**
 * Raw shape of a master-data catalog. Any caller can construct this
 * shape directly — it makes no promise about duplicate-free collections.
 * Use this only as input to createMasterData(); do not treat it as a
 * validated snapshot.
 */
export interface MasterDataInput {
  readonly employees: readonly EmployeeReference[]
  readonly crews: readonly CrewReference[]
  readonly sectors: readonly SectorReference[]
  readonly locations: readonly LocationReference[]
  readonly samplingHouses: readonly SamplingHouseReference[]
  readonly pileAreas: readonly PileAreaReference[]
  readonly haulers: readonly HaulerReference[]
  readonly trucks: readonly TruckReference[]
  readonly oreSamplingConfigs: readonly OreSamplingConfig[]
}

/**
 * A validated master-data snapshot. Branded (nominal, no runtime field)
 * so that a raw MasterDataInput-shaped object — which may contain
 * duplicate keys — cannot be assigned directly as a MasterData. The
 * only way to obtain one is createMasterData(), which guarantees every
 * collection is duplicate-free and independent of caller-owned arrays.
 */
export type MasterData = Brand<MasterDataInput, 'MasterData'>

/**
 * Detects duplicate logical keys within a single master collection.
 * Does not mutate `items`. Shared by every duplicate-key check below
 * so that duplicate ambiguity is caught the same way everywhere.
 */
function validateUniqueKeys<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  errorCode: string,
  label: string,
): Result<readonly T[]> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) {
      duplicates.add(key)
    }
    seen.add(key)
  }
  if (duplicates.size > 0) {
    return err<DomainError>({
      code: errorCode,
      message: `Duplicate ${label} in master collection: ${[...duplicates].join(', ')}`,
    })
  }
  return ok(items)
}

export function validateMasterEmployees(employees: readonly EmployeeReference[]): Result<readonly EmployeeReference[]> {
  return validateUniqueKeys(employees, (e) => e.id, 'DUPLICATE_EMPLOYEE_ID', 'EmployeeId')
}

export function validateMasterCrews(crews: readonly CrewReference[]): Result<readonly CrewReference[]> {
  return validateUniqueKeys(crews, (c) => c.code, 'DUPLICATE_CREW_CODE', 'CrewCode')
}

export function validateMasterSectors(sectors: readonly SectorReference[]): Result<readonly SectorReference[]> {
  return validateUniqueKeys(sectors, (s) => s.code, 'DUPLICATE_SECTOR_CODE', 'SectorCode')
}

export function validateMasterLocations(locations: readonly LocationReference[]): Result<readonly LocationReference[]> {
  return validateUniqueKeys(locations, (l) => l.code, 'DUPLICATE_LOCATION_CODE', 'LocationCode')
}

/**
 * Sampling-house logical uniqueness is Sector + Sampling House
 * (Phase 16 §2B) — the same Sampling_House_Code legitimately repeats
 * across different sectors, so the key must include `sectorCode`.
 */
export function validateMasterSamplingHouses(
  samplingHouses: readonly SamplingHouseReference[],
): Result<readonly SamplingHouseReference[]> {
  return validateUniqueKeys(
    samplingHouses,
    (s) => `${s.sectorCode}::${s.code}`,
    'DUPLICATE_SAMPLING_HOUSE_CODE',
    'Sector+SamplingHouseCode',
  )
}

/**
 * Pile_ID is globally unique within MasterData (Phase 16 §2C) —
 * Stockpile_Code is deliberately NOT validated as unique here, since
 * many piles legitimately share one stockpile.
 */
export function validateMasterPileAreas(pileAreas: readonly PileAreaReference[]): Result<readonly PileAreaReference[]> {
  return validateUniqueKeys(pileAreas, (p) => p.pileId, 'DUPLICATE_PILE_AREA_PILE_ID', 'PileId')
}

/** Phase 16 §3 referential integrity: every Sampling_Houses.Sector_Code must resolve to a known Sector. */
export function validateSamplingHouseSectorReferences(
  samplingHouses: readonly SamplingHouseReference[],
  sectors: readonly SectorReference[],
): Result<readonly SamplingHouseReference[]> {
  const knownSectorCodes = new Set<string>(sectors.map((sector) => sector.code as string))
  const orphan = samplingHouses.find((house) => !knownSectorCodes.has(house.sectorCode as string))
  if (orphan) {
    return err<DomainError>({
      code: 'MASTER_SAMPLING_HOUSE_SECTOR_NOT_FOUND',
      message: `Sampling house ${orphan.code} references unknown SectorCode ${orphan.sectorCode}`,
    })
  }
  return ok(samplingHouses)
}

/** Phase 16 §3 referential integrity: every Pile_Areas.Sector_Code must resolve to a known Sector. */
export function validatePileAreaSectorReferences(
  pileAreas: readonly PileAreaReference[],
  sectors: readonly SectorReference[],
): Result<readonly PileAreaReference[]> {
  const knownSectorCodes = new Set<string>(sectors.map((sector) => sector.code as string))
  const orphan = pileAreas.find((pileArea) => !knownSectorCodes.has(pileArea.sectorCode as string))
  if (orphan) {
    return err<DomainError>({
      code: 'MASTER_PILE_AREA_SECTOR_NOT_FOUND',
      message: `Pile area ${orphan.pileId} references unknown SectorCode ${orphan.sectorCode}`,
    })
  }
  return ok(pileAreas)
}

/** Phase 16 §3 referential integrity: every Pile_Areas.Ore must resolve to a known Ore_Sampling_Config entry. */
export function validatePileAreaOreReferences(
  pileAreas: readonly PileAreaReference[],
  oreSamplingConfigs: readonly OreSamplingConfig[],
): Result<readonly PileAreaReference[]> {
  const knownOreCodes = new Set<string>(oreSamplingConfigs.map((config) => config.oreCode as string))
  const orphan = pileAreas.find((pileArea) => !knownOreCodes.has(pileArea.oreCode as string))
  if (orphan) {
    return err<DomainError>({
      code: 'MASTER_PILE_AREA_ORE_NOT_FOUND',
      message: `Pile area ${orphan.pileId} references unknown Ore ${orphan.oreCode}`,
    })
  }
  return ok(pileAreas)
}

/** Phase 16 §3 referential integrity: every Trucks.Hauler_Code must resolve to a known Hauler. */
export function validateTruckHaulerReferences(
  trucks: readonly TruckReference[],
  haulers: readonly HaulerReference[],
): Result<readonly TruckReference[]> {
  const knownHaulerCodes = new Set<string>(haulers.map((hauler) => hauler.code as string))
  const orphan = trucks.find((truck) => !knownHaulerCodes.has(truck.haulerCode as string))
  if (orphan) {
    return err<DomainError>({
      code: 'MASTER_TRUCK_HAULER_NOT_FOUND',
      message: `Truck ${orphan.id} references unknown HaulerCode ${orphan.haulerCode}`,
    })
  }
  return ok(trucks)
}

export function validateMasterHaulers(haulers: readonly HaulerReference[]): Result<readonly HaulerReference[]> {
  return validateUniqueKeys(haulers, (h) => h.code, 'DUPLICATE_HAULER_CODE', 'HaulerCode')
}

export function validateMasterTrucks(trucks: readonly TruckReference[]): Result<readonly TruckReference[]> {
  return validateUniqueKeys(trucks, (t) => t.id, 'DUPLICATE_TRUCK_ID', 'TruckId')
}

export function validateMasterOreSamplingConfigs(
  configs: readonly OreSamplingConfig[],
): Result<readonly OreSamplingConfig[]> {
  return validateUniqueKeys(configs, (c) => c.oreCode, 'DUPLICATE_ORE_CODE', 'OreCode')
}

/**
 * Builds a validated MasterData snapshot. Fails if any collection
 * contains a duplicate logical key (§9) — ambiguous lookups must not
 * be constructible. The returned snapshot holds shallow copies of every
 * collection, so later mutation of the caller's arrays cannot change it.
 */
export function createMasterData(params: MasterDataInput): Result<MasterData> {
  const checks: ReadonlyArray<Result<unknown>> = [
    validateMasterEmployees(params.employees),
    validateMasterCrews(params.crews),
    validateMasterSectors(params.sectors),
    validateMasterLocations(params.locations),
    validateMasterSamplingHouses(params.samplingHouses),
    validateMasterPileAreas(params.pileAreas),
    validateMasterHaulers(params.haulers),
    validateMasterTrucks(params.trucks),
    validateMasterOreSamplingConfigs(params.oreSamplingConfigs),
    validateSamplingHouseSectorReferences(params.samplingHouses, params.sectors),
    validatePileAreaSectorReferences(params.pileAreas, params.sectors),
    validatePileAreaOreReferences(params.pileAreas, params.oreSamplingConfigs),
    validateTruckHaulerReferences(params.trucks, params.haulers),
  ]
  for (const check of checks) {
    if (!check.ok) {
      return check
    }
  }
  const snapshot: MasterDataInput = {
    employees: [...params.employees],
    crews: [...params.crews],
    sectors: [...params.sectors],
    locations: [...params.locations],
    samplingHouses: [...params.samplingHouses],
    pileAreas: [...params.pileAreas],
    haulers: [...params.haulers],
    trucks: [...params.trucks],
    oreSamplingConfigs: [...params.oreSamplingConfigs],
  }
  return ok(snapshot as MasterData)
}

/**
 * Looks up an ore sampling configuration by OreCode. Returns
 * `undefined` explicitly on a miss — callers must not assume any
 * fallback/default configuration.
 */
export function findOreSamplingConfig(masterData: MasterData, oreCode: OreCode): OreSamplingConfig | undefined {
  return masterData.oreSamplingConfigs.find((config) => config.oreCode === oreCode)
}

/**
 * Looks up a truck by TruckId. Returns `undefined` explicitly on a
 * miss — callers must not assume any fallback/default truck.
 */
export function findTruck(masterData: MasterData, truckId: TruckId): TruckReference | undefined {
  return masterData.trucks.find((truck) => truck.id === truckId)
}

/**
 * Looks up an employee by EmployeeId (BR-DELIVERY-003: a Dispatcher NIK
 * must come from the employee master). Returns `undefined` explicitly on
 * a miss — callers must not assume any fallback/default employee.
 */
export function findEmployee(masterData: MasterData, employeeId: EmployeeId): EmployeeReference | undefined {
  return masterData.employees.find((employee) => employee.id === employeeId)
}

/**
 * Looks up a crew by CrewCode (BR-MAN-002: crew/job assignment comes
 * from the crew master). Returns `undefined` explicitly on a miss —
 * callers must not assume any fallback/default crew.
 */
export function findCrew(masterData: MasterData, code: CrewCode): CrewReference | undefined {
  return masterData.crews.find((crew) => crew.code === code)
}

/**
 * Looks up a pile area by PileId (Phase 18 §5/§6: Fleet Setup's
 * Destination/Pile field and New Pile Master duplicate detection both
 * need a single-row lookup rather than re-filtering `pileAreas` inline).
 * Returns `undefined` explicitly on a miss.
 */
export function findPileArea(masterData: MasterData, pileId: PileId): PileAreaReference | undefined {
  return masterData.pileAreas.find((pileArea) => pileArea.pileId === pileId)
}
