import { describe, expect, it } from 'vitest'
import { deriveActivePiles } from '@/application/pile-workspace/derive-active-piles'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseFleetId, parseFrontId, parsePileId } from '@/domain/common/identifiers'
import { createFrontDefinition } from '@/domain/fleet/front'
import { createBaseFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { createHaulerReference, createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createPile } from '@/domain/pile/pile'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  const sectorCode = value(parseSectorCode('BR1'))
  const haulerCode = value(parseHaulerCode('H1'))
  const sap = value(parseOreCode('SAP'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sectorCode)],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(sectorCode, value(parsePileAreaCode('LS_18')), value(parsePileId('L18_S09')), sap),
      ],
      haulers: [createHaulerReference(haulerCode)],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function buildFleetSetupWithDestination(masterData: MasterData, destinationPileId?: string): FleetSetup {
  const sectorCode = value(parseSectorCode('BR1'))
  const haulerCode = value(parseHaulerCode('H1'))
  const front = createFrontDefinition(
    value(parseFrontId('BR1/01')),
    sectorCode,
    haulerCode,
    destinationPileId ? value(parsePileId(destinationPileId)) : undefined,
  )
  const fleet = value(
    createBaseFleetDefinition({
      fleetId: value(parseFleetId('FLEET-1')),
      frontId: front.frontId,
      truckIds: [],
    }),
  )
  return value(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

describe('deriveActivePiles', () => {
  it('includes carry-over piles', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetupWithDestination(masterData)
    const carryOverPile = createPile(value(parsePileId('CARRY-1')), value(parseOreCode('SAP')))

    const piles = deriveActivePiles({ carryOverPiles: [carryOverPile], fleetSetup, masterData })

    expect(piles).toEqual([carryOverPile])
  })

  it('includes a Fleet Setup Front destination, deriving Ore from master (never retyped)', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetupWithDestination(masterData, 'L18_S09')

    const piles = deriveActivePiles({ carryOverPiles: [], fleetSetup, masterData })

    expect(piles).toEqual([{ id: 'L18_S09', oreCode: 'SAP' }])
  })

  it('deduplicates by PileId, preferring the carry-over Pile when both sources reference the same Pile_ID', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetupWithDestination(masterData, 'L18_S09')
    const carryOverPile = createPile(value(parsePileId('L18_S09')), value(parseOreCode('LIM')))

    const piles = deriveActivePiles({ carryOverPiles: [carryOverPile], fleetSetup, masterData })

    expect(piles).toEqual([carryOverPile])
  })

  it('ignores a Front with no configured destination', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetupWithDestination(masterData)

    const piles = deriveActivePiles({ carryOverPiles: [], fleetSetup, masterData })

    expect(piles).toEqual([])
  })
})
