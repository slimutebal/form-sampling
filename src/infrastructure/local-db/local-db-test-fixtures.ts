import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '../../domain/common/codes'
import {
  parseFleetId,
  parseFrontId,
  parseHaulageTransactionId,
  parsePileId,
  parseShiftId,
  parseTruckId,
} from '../../domain/common/identifiers'
import type { FleetId, FrontId, HaulageTransactionId, PileId, ShiftId, TruckId } from '../../domain/common/identifiers'
import type { Result } from '../../domain/common/result'
import { parseShiftDate } from '../../domain/common/shift-date'
import { createBatchPosition, type BatchPosition } from '../../domain/batch/batch-position'
import { parseBatchNumber } from '../../domain/batch/batch-number'
import { parseRitNumber } from '../../domain/batch/rit-number'
import { createFrontDefinition } from '../../domain/fleet/front'
import { createBaseFleetDefinition } from '../../domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '../../domain/fleet/fleet-setup'
import { createHaulageTransaction, type HaulageTransaction } from '../../domain/haulage/haulage-transaction'
import { createMasterData, type MasterData } from '../../domain/master/master-data'
import { parseHaulerCode } from '../../domain/master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../../domain/master/references'
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
} from '../../domain/master/sampling-config'
import { createPile, type Pile } from '../../domain/pile/pile'
import { createShift, type Shift } from '../../domain/shift/shift'

/**
 * Test-only fixture builders shared by the LocalOperationalStore test
 * suites. Not imported by any production module — kept in
 * `infrastructure/local-db` purely to avoid duplicating a non-trivial
 * MasterData/FleetSetup/HaulageTransaction construction across multiple
 * test files.
 */
function must<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`invalid test fixture: ${result.error.code}`)
  }
  return result.value
}

export function fixtureShiftId(value: string): ShiftId {
  return must(parseShiftId(value))
}

export function fixturePileId(value: string): PileId {
  return must(parsePileId(value))
}

export function fixtureTruckId(value: string): TruckId {
  return must(parseTruckId(value))
}

export function fixtureFleetId(value: string): FleetId {
  return must(parseFleetId(value))
}

export function fixtureFrontId(value: string): FrontId {
  return must(parseFrontId(value))
}

export function fixtureTransactionId(value: string): HaulageTransactionId {
  return must(parseHaulageTransactionId(value))
}

export function fixturePosition(batch: number, rit: number): BatchPosition {
  return createBatchPosition(must(parseBatchNumber(batch)), must(parseRitNumber(rit)))
}

const SECTOR_CODE = 'S1'
const HAULER_CODE = 'H1'
export const FIXTURE_FLEET_ID = 'FLEET-A'
export const FIXTURE_FRONT_ID = 'F1'
export const FIXTURE_IN_FLEET_TRUCK_ID = 'T1'
export const FIXTURE_WRONG_TRUCK_TRUCK_ID = 'T2'

/** A minimal validated MasterData snapshot: one sector/hauler, two known trucks, SAP + LIM ore rules. */
export function buildFixtureMasterData(): MasterData {
  const sector = must(parseSectorCode(SECTOR_CODE))
  const hauler = must(parseHaulerCode(HAULER_CODE))
  const sap = must(parseOreCode('SAP'))
  const lim = must(parseOreCode('LIM'))

  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [createHaulerReference(hauler)],
      trucks: [
        createTruckReference(fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID), hauler),
        createTruckReference(fixtureTruckId(FIXTURE_WRONG_TRUCK_TRUCK_ID), hauler),
      ],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
        createOreSamplingConfig({
          oreCode: lim,
          interval: must(parseSamplingInterval(5)),
          batchSize: must(parseBatchSize(100)),
          packing: must(parsePackingConfigValue(10)),
        }),
      ],
    }),
  )
}

/** A FleetSetup with one BASE fleet (FLEET-A/F1) whose only member is T1 — T2 is a known but out-of-fleet truck. */
export function buildFixtureFleetSetup(masterData: MasterData): FleetSetup {
  const sector = must(parseSectorCode(SECTOR_CODE))
  const hauler = must(parseHaulerCode(HAULER_CODE))
  const front = createFrontDefinition(fixtureFrontId(FIXTURE_FRONT_ID), sector, hauler)
  const fleet = must(
    createBaseFleetDefinition({
      fleetId: fixtureFleetId(FIXTURE_FLEET_ID),
      frontId: fixtureFrontId(FIXTURE_FRONT_ID),
      truckIds: [fixtureTruckId(FIXTURE_IN_FLEET_TRUCK_ID)],
    }),
  )
  return must(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

export function buildFixtureSapPile(id: string): Pile {
  return createPile(fixturePileId(id), must(parseOreCode('SAP')))
}

export function buildFixtureShift(id: string): Shift {
  return createShift({
    id: fixtureShiftId(id),
    date: must(parseShiftDate('2026-09-04')),
    shiftCode: must(parseShiftCode('D')),
    sectorCode: must(parseSectorCode(SECTOR_CODE)),
    samplingHouseCode: must(parseSamplingHouseCode('HOUSE-1')),
    status: 'ACTIVE',
  })
}

export interface BuildFixtureHaulageTransactionParams {
  readonly id: string
  readonly shiftId: string
  readonly pile: Pile
  readonly batch: number
  readonly rit: number
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  readonly truckId?: string
}

/** Builds a validated HaulageTransaction. Pass `truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID` to get a WRONG_TRUCK snapshot. */
export function buildFixtureHaulageTransaction(params: BuildFixtureHaulageTransactionParams): HaulageTransaction {
  return must(
    createHaulageTransaction({
      id: fixtureTransactionId(params.id),
      shiftId: fixtureShiftId(params.shiftId),
      pile: params.pile,
      batchPosition: fixturePosition(params.batch, params.rit),
      fleetId: fixtureFleetId(FIXTURE_FLEET_ID),
      truckId: fixtureTruckId(params.truckId ?? FIXTURE_IN_FLEET_TRUCK_ID),
      masterData: params.masterData,
      fleetSetup: params.fleetSetup,
    }),
  )
}
