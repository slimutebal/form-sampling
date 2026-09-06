import { describe, expect, it } from 'vitest'
import { appendFrontContinuation } from './append-front-continuation'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseFleetId, parseFrontId, parsePileId, parseTruckId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { createBaseFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition } from '@/domain/fleet/front'
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

function buildMasterData(extraPileIds: readonly string[] = []): MasterData {
  const sector = must(parseSectorCode(SECTOR))
  const hauler = must(parseHaulerCode(HAULER))
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
        ...extraPileIds.map((id) => createPileAreaReference(sector, stockpile, must(parsePileId(id)), ore)),
      ],
      haulers: [createHaulerReference(hauler)],
      trucks: [
        createTruckReference(must(parseTruckId('A')), hauler),
        createTruckReference(must(parseTruckId('B')), hauler),
        createTruckReference(must(parseTruckId('D')), hauler),
        createTruckReference(must(parseTruckId('E')), hauler),
        createTruckReference(must(parseTruckId('F')), hauler),
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
      truckIds: [must(parseTruckId('A')), must(parseTruckId('B')), must(parseTruckId('D')), must(parseTruckId('E'))],
    }),
  )
  return must(createFleetSetup({ fronts: [front01], fleets: [fleet01] }, masterData))
}

describe('appendFrontContinuation', () => {
  it('auto-assigns the next Front Number (max + 1) and inherits Hauler/effective trucks from the reference', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.newFront.frontId).toBe('BR1/02')
    expect(result.value.newFront.haulerCode).toBe(HAULER)
    expect(result.value.effectiveFleet.truckIds).toEqual(['A', 'B', 'D', 'E'])
  })

  it('applies an Add/Remove delta on top of the inherited fleet', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: ['F'],
      removedTruckIds: ['D'],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleet.truckIds).toEqual(['A', 'B', 'E', 'F'])
  })

  it('keeps the reference Front\'s Destination when none is given', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.newFront.destinationPileId).toBe('L18_S09')
  })

  it('changes Destination to a different existing master Pile without disturbing the old one', () => {
    const masterData = buildMasterData(['L18_S10'])
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      destinationPileId: 'L18_S10',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.newFront.destinationPileId).toBe('L18_S10')
    // The original Front's own Destination is untouched.
    expect(fleetSetup.fronts[0]?.destinationPileId).toBe('L18_S09')
  })

  it('rejects a Destination Pile_ID not found in this Sector\'s master', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      destinationPileId: 'UNKNOWN_PILE',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_DESTINATION_PILE_NOT_FOUND')
  })

  it('rejects a reference Front that does not exist', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/99',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_FOUND')
  })

  it('rejects continuing from a Front that already has a successor (FRONT_ALREADY_SUPERSEDED)', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const firstContinuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })
    expect(firstContinuation.ok).toBe(true)
    if (!firstContinuation.ok) return

    const secondAttempt = appendFrontContinuation({
      fleetSetup: firstContinuation.value.fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-05',
    })

    expect(secondAttempt.ok).toBe(false)
    if (secondAttempt.ok) return
    expect(secondAttempt.error.code).toBe('FRONT_ALREADY_SUPERSEDED')
  })

  it('supports a multi-hop continuation once the first successor becomes historical', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const first = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-04',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = appendFrontContinuation({
      fleetSetup: first.value.fleetSetup,
      masterData,
      referenceFrontId: 'BR1/02',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-07',
    })

    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.newFront.frontId).toBe('BR1/03')
  })

  it('rejects once the Front Number limit of 25 is already reached', () => {
    const masterData = buildMasterData()
    const sector = must(parseSectorCode(SECTOR))
    const hauler = must(parseHaulerCode(HAULER))
    const fronts = Array.from({ length: 25 }, (_, index) =>
      createFrontDefinition(
        must(parseFrontId(`BR1/${String(index + 1).padStart(2, '0')}`)),
        sector,
        hauler,
      ),
    )
    const fleets = fronts.map((frontDefinition, index) =>
      must(
        createBaseFleetDefinition({
          fleetId: must(parseFleetId(`FLEET-${index + 1}`)),
          frontId: frontDefinition.frontId,
          truckIds: [],
        }),
      ),
    )
    const fleetSetup = must(createFleetSetup({ fronts, fleets }, masterData))

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-26',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NUMBER_LIMIT_REACHED')
  })

  it('reuses createFleetSetup for full re-validation — a contradictory delta is rejected', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: ['D'],
      removedTruckIds: ['D'],
      fleetId: 'FLEET-04',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CONTRADICTORY_FLEET_DELTA')
  })
})
