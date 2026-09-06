import { describe, expect, it } from 'vitest'
import { appendNewBaseFront } from './append-new-base-front'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseFleetId, parseFrontId, parsePileId, parseTruckId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { createBaseFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition } from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createPileAreaReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.error)}`)
  return result.value
}

const SECTOR = 'BR1'
const HAULER = 'H1'
const HAULER_2 = 'H2'

function buildMasterData(): MasterData {
  const sector = must(parseSectorCode(SECTOR))
  const hauler = must(parseHaulerCode(HAULER))
  const hauler2 = must(parseHaulerCode(HAULER_2))
  const ore = must(parseOreCode('ORE1'))
  const stockpile = must(parsePileAreaCode('S09'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(sector, stockpile, must(parsePileId('L18_S09')), ore),
        createPileAreaReference(sector, must(parsePileAreaCode('S27')), must(parsePileId('L9_27')), ore),
      ],
      haulers: [createHaulerReference(hauler), createHaulerReference(hauler2)],
      trucks: [
        createTruckReference(must(parseTruckId('STM-A40_0001')), hauler2),
        createTruckReference(must(parseTruckId('STM-A40_0002')), hauler2),
        createTruckReference(must(parseTruckId('A')), hauler),
      ],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: ore,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function buildFleetSetup(masterData: MasterData): FleetSetup {
  const sector = must(parseSectorCode(SECTOR))
  const hauler = must(parseHaulerCode(HAULER))
  const front01 = createFrontDefinition(
    must(parseFrontId('BR1/01')),
    sector,
    hauler,
    must(parsePileId('L18_S09')),
  )
  const fleet01 = must(
    createBaseFleetDefinition({
      fleetId: must(parseFleetId('FLEET-01')),
      frontId: must(parseFrontId('BR1/01')),
      truckIds: [must(parseTruckId('A'))],
    }),
  )
  return must(createFleetSetup({ fronts: [front01], fleets: [fleet01] }, masterData))
}

describe('appendNewBaseFront', () => {
  it('creates an independent BASE Front with its own Hauler, Destination, and Trucks (Phase 18 §2)', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: 'L9_27',
      truckIds: ['STM-A40_0001', 'STM-A40_0002'],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.newFront.frontId).toBe('BR1/02')
    expect(result.value.newFront.haulerCode).toBe(HAULER_2)
    expect(result.value.newFront.destinationPileId).toBe('L9_27')
    expect(result.value.effectiveFleet.truckIds).toEqual(['STM-A40_0001', 'STM-A40_0002'])
  })

  it('auto-assigns the next Front Number for the Sector, same rule as a continuation', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: 'L9_27',
      truckIds: [],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.newFront.frontId).toBe('BR1/02')
  })

  it('requires a Destination — a new independent BASE Front has no reference to inherit one from', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: '',
      truckIds: [],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_DESTINATION_REQUIRED')
  })

  it('rejects a Destination Pile_ID not found in this Sector\'s master', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: 'UNKNOWN_PILE',
      truckIds: [],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_DESTINATION_PILE_NOT_FOUND')
  })

  it('rejects an unknown Hauler', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: '',
      destinationPileId: 'L9_27',
      truckIds: [],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_HAULER_CODE')
  })

  it('does not retire the existing Front — both Fronts stay independently ACTIVE', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: 'L9_27',
      truckIds: [],
      fleetId: 'FLEET-02',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lineage = deriveFrontLineage(result.value.fleetSetup)
    expect(lineage.historicalFrontIds).toEqual([])
    expect([...lineage.activeFrontIds].sort()).toEqual(['BR1/01', 'BR1/02'])
  })

  it('reuses createFleetSetup for full re-validation — a duplicate FleetId is rejected', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendNewBaseFront({
      fleetSetup,
      masterData,
      sectorCode: SECTOR,
      haulerCode: HAULER_2,
      destinationPileId: 'L9_27',
      truckIds: [],
      fleetId: 'FLEET-01',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_ID')
  })
})
