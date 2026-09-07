import { describe, expect, it } from 'vitest'
import { appendFrontContinuation } from './append-front-continuation'
import { adjustFrontFleet } from './adjust-front-fleet'
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
import { validateTruckForFleet } from '@/domain/fleet/truck-validation'

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
      pileAreas: [createPileAreaReference(sector, stockpile, must(parsePileId('L18_S09')), ore)],
      haulers: [createHaulerReference(hauler), createHaulerReference(hauler2)],
      trucks: [
        createTruckReference(must(parseTruckId('DT01')), hauler),
        createTruckReference(must(parseTruckId('DT02')), hauler),
        createTruckReference(must(parseTruckId('DT03')), hauler),
        createTruckReference(must(parseTruckId('DT04')), hauler),
        createTruckReference(must(parseTruckId('OTHER-1')), hauler2),
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

function buildBaseFleetSetup(masterData: MasterData): FleetSetup {
  const sector = must(parseSectorCode(SECTOR))
  const hauler = must(parseHaulerCode(HAULER))
  const front = createFrontDefinition(must(parseFrontId('BR1/04')), sector, hauler, must(parsePileId('L18_S09')))
  const fleet = must(
    createBaseFleetDefinition({
      fleetId: must(parseFleetId('FLEET-04')),
      frontId: front.frontId,
      truckIds: [must(parseTruckId('DT01')), must(parseTruckId('DT02')), must(parseTruckId('DT03'))],
    }),
  )
  return must(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

describe('adjustFrontFleet — BASE Front', () => {
  it('replaces the effective fleet without changing the Front ID (BR1/04 stays BR1/04)', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT01', 'DT03', 'DT04'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleet.frontId).toBe('BR1/04')
    expect(result.value.fleetSetup.fronts.map((front) => front.frontId)).toEqual(['BR1/04'])
    expect(result.value.effectiveFleet.truckIds).toEqual(['DT01', 'DT03', 'DT04'])
  })

  it('rejects a Front that is not ACTIVE (historical Front cannot be edited)', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)
    const continuation = appendFrontContinuation({
      fleetSetup,
      masterData,
      referenceFrontId: 'BR1/04',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-05',
    })
    expect(continuation.ok).toBe(true)
    if (!continuation.ok) return

    const result = adjustFrontFleet({
      fleetSetup: continuation.value.fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT04'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_ACTIVE')
  })

  it('rejects a duplicate truck in the desired list', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT01', 'DT01'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
  })

  it('rejects a truck that belongs to a different Hauler than the Front', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT01', 'OTHER-1'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_HAULER_MISMATCH')
  })

  it('rejects a Front that does not exist', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/09',
      truckIds: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_FOUND')
  })

  it('classifies trucks against the new effective fleet — added truck VALID, removed truck TRUCK SALAH', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const before = validateTruckForFleet(masterData, fleetSetup, must(parseFleetId('FLEET-04')), must(parseTruckId('DT02')))
    expect(before.ok).toBe(true)
    if (before.ok) expect(before.value.status).toBe('VALID')

    const adjusted = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT01', 'DT03', 'DT04'],
    })
    expect(adjusted.ok).toBe(true)
    if (!adjusted.ok) return

    const dt04AfterAdjustment = validateTruckForFleet(
      masterData,
      adjusted.value.fleetSetup,
      must(parseFleetId('FLEET-04')),
      must(parseTruckId('DT04')),
    )
    expect(dt04AfterAdjustment.ok).toBe(true)
    if (dt04AfterAdjustment.ok) expect(dt04AfterAdjustment.value.status).toBe('VALID')

    const dt02AfterAdjustment = validateTruckForFleet(
      masterData,
      adjusted.value.fleetSetup,
      must(parseFleetId('FLEET-04')),
      must(parseTruckId('DT02')),
    )
    expect(dt02AfterAdjustment.ok).toBe(true)
    if (dt02AfterAdjustment.ok) {
      expect(dt02AfterAdjustment.value.status).toBe('WRONG_TRUCK')
      if (dt02AfterAdjustment.value.status === 'WRONG_TRUCK') {
        expect(dt02AfterAdjustment.value.reasons).toContain('NOT_IN_EFFECTIVE_FLEET')
      }
    }
  })

  it('rejects a final effective fleet of 0 trucks — an ACTIVE Front must retain at least 1 unit', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_MINIMUM_UNIT_REQUIRED')
    // Rejecting the save never marks the Front inactive or otherwise mutates the stored setup.
    expect(fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/04')).toMatchObject({
      kind: 'BASE',
      truckIds: ['DT01', 'DT02', 'DT03'],
    })
  })

  it('removing down to exactly 1 truck succeeds — the minimum is 1, not 0', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildBaseFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/04',
      truckIds: ['DT01'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleet.truckIds).toEqual(['DT01'])
  })
})

describe('adjustFrontFleet — DERIVED Front', () => {
  function buildDerivedFleetSetup(masterData: MasterData): FleetSetup {
    const sector = must(parseSectorCode(SECTOR))
    const hauler = must(parseHaulerCode(HAULER))
    const front01 = createFrontDefinition(must(parseFrontId('BR1/01')), sector, hauler, must(parsePileId('L18_S09')))
    const fleet01 = must(
      createBaseFleetDefinition({
        fleetId: must(parseFleetId('FLEET-01')),
        frontId: front01.frontId,
        truckIds: [must(parseTruckId('DT01')), must(parseTruckId('DT02'))],
      }),
    )
    const baseSetup = must(createFleetSetup({ fronts: [front01], fleets: [fleet01] }, masterData))

    const continuation = appendFrontContinuation({
      fleetSetup: baseSetup,
      masterData,
      referenceFrontId: 'BR1/01',
      addedTruckIds: [],
      removedTruckIds: [],
      fleetId: 'FLEET-02',
    })
    if (!continuation.ok) throw new Error('invalid test fixture')
    return continuation.value.fleetSetup
  }

  it('preserves the referenceFleetId (lineage) while adjusting only the add/remove delta', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildDerivedFleetSetup(masterData)
    const derivedFleetBefore = fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/02')
    if (derivedFleetBefore?.kind !== 'DERIVED') throw new Error('invalid test fixture')

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/02',
      truckIds: ['DT01', 'DT03'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts.map((front) => front.frontId).sort()).toEqual(['BR1/01', 'BR1/02'])
    expect(result.value.effectiveFleet.truckIds).toEqual(['DT01', 'DT03'])

    const derivedFleetAfter = result.value.fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/02')
    expect(derivedFleetAfter?.kind).toBe('DERIVED')
    if (derivedFleetAfter?.kind === 'DERIVED') {
      expect(derivedFleetAfter.referenceFleetId).toBe(derivedFleetBefore.referenceFleetId)
    }
    // The predecessor Front's own BASE fleet is never mutated.
    const predecessorFleet = result.value.fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/01')
    expect(predecessorFleet).toMatchObject({ kind: 'BASE', truckIds: ['DT01', 'DT02'] })
  })

  it('rejects a final effective fleet of 0 trucks on a DERIVED Front too', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildDerivedFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/02',
      truckIds: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_MINIMUM_UNIT_REQUIRED')
  })

  it('removing down to exactly 1 truck succeeds on a DERIVED Front, preserving referenceFleetId', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildDerivedFleetSetup(masterData)
    const derivedFleetBefore = fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/02')
    if (derivedFleetBefore?.kind !== 'DERIVED') throw new Error('invalid test fixture')

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/02',
      truckIds: ['DT01'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleet.truckIds).toEqual(['DT01'])
    const derivedFleetAfter = result.value.fleetSetup.fleets.find((fleet) => fleet.frontId === 'BR1/02')
    expect(derivedFleetAfter?.kind).toBe('DERIVED')
    if (derivedFleetAfter?.kind === 'DERIVED') {
      expect(derivedFleetAfter.referenceFleetId).toBe(derivedFleetBefore.referenceFleetId)
    }
  })

  it('rejects adjusting a historical (superseded) DERIVED-referenced predecessor Front', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildDerivedFleetSetup(masterData)

    const result = adjustFrontFleet({
      fleetSetup,
      masterData,
      frontId: 'BR1/01',
      truckIds: ['DT01'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_ACTIVE')
  })
})
