import { describe, expect, it } from 'vitest'
import { parseSectorCode } from '../common/codes'
import { parseFleetId, parseFrontId, parseTruckId } from '../common/identifiers'
import type { FleetId, FrontId, TruckId } from '../common/identifiers'
import { createMasterData, type MasterData } from '../master/master-data'
import { parseHaulerCode } from '../master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../master/references'
import { createFrontDefinition, type FrontDefinition } from './front'
import { createBaseFleetDefinition, createDerivedFleetDefinition, type FleetDefinition } from './fleet-definition'
import { createFleetSetup } from './fleet-setup'
import { deriveFrontLineage, findFrontReferenceBranching } from './front-lineage'

function truckId(value: string): TruckId {
  const parsed = parseTruckId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function fleetId(value: string): FleetId {
  const parsed = parseFleetId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function frontId(value: string): FrontId {
  const parsed = parseFrontId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function buildMasterData(): MasterData {
  const sector = parseSectorCode('BR1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')

  const result = createMasterData({
    employees: [],
    crews: [],
    sectors: [createSectorReference(sector.value)],
    locations: [],
    samplingHouses: [],
    pileAreas: [],
    haulers: [createHaulerReference(hauler.value)],
    trucks: [
      createTruckReference(truckId('T1'), hauler.value),
      createTruckReference(truckId('T2'), hauler.value),
    ],
    oreSamplingConfigs: [],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function front(id: string): FrontDefinition {
  const sector = parseSectorCode('BR1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  return createFrontDefinition(frontId(id), sector.value, hauler.value)
}

function baseFleet(id: string, forFrontId: string): FleetDefinition {
  const result = createBaseFleetDefinition({ fleetId: fleetId(id), frontId: frontId(forFrontId), truckIds: [truckId('T1')] })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function derivedFleet(id: string, forFrontId: string, referenceId: string): FleetDefinition {
  const result = createDerivedFleetDefinition({
    fleetId: fleetId(id),
    frontId: frontId(forFrontId),
    referenceFleetId: fleetId(referenceId),
    addedTruckIds: [],
    removedTruckIds: [],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

describe('deriveFrontLineage', () => {
  it('treats every Front as active when there are no Fleet References', () => {
    const masterData = buildMasterData()
    const setup = createFleetSetup(
      { fronts: [front('BR1/01'), front('BR1/02')], fleets: [baseFleet('FLEET-1', 'BR1/01'), baseFleet('FLEET-2', 'BR1/02')] },
      masterData,
    )
    expect(setup.ok).toBe(true)
    if (!setup.ok) return

    const lineage = deriveFrontLineage(setup.value)
    expect(lineage.activeFrontIds).toEqual(['BR1/01', 'BR1/02'])
    expect(lineage.historicalFrontIds).toEqual([])
  })

  it('marks a referenced Front historical and its continuation active (single-hop)', () => {
    const masterData = buildMasterData()
    const setup = createFleetSetup(
      {
        fronts: [front('BR1/01'), front('BR1/04')],
        fleets: [baseFleet('FLEET-1', 'BR1/01'), derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1')],
      },
      masterData,
    )
    expect(setup.ok).toBe(true)
    if (!setup.ok) return

    const lineage = deriveFrontLineage(setup.value)
    expect(lineage.activeFrontIds).toEqual(['BR1/04'])
    expect(lineage.historicalFrontIds).toEqual(['BR1/01'])
    expect(lineage.successorFrontIdByFrontId.get(frontId('BR1/01'))).toBe('BR1/04')
    expect(lineage.predecessorFrontIdByFrontId.get(frontId('BR1/04'))).toBe('BR1/01')
  })

  it('resolves a multi-hop continuation chain (BR1/01 -> BR1/04 -> BR1/07)', () => {
    const masterData = buildMasterData()
    const setup = createFleetSetup(
      {
        fronts: [front('BR1/01'), front('BR1/04'), front('BR1/07')],
        fleets: [
          baseFleet('FLEET-1', 'BR1/01'),
          derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1'),
          derivedFleet('FLEET-7', 'BR1/07', 'FLEET-4'),
        ],
      },
      masterData,
    )
    expect(setup.ok).toBe(true)
    if (!setup.ok) return

    const lineage = deriveFrontLineage(setup.value)
    expect(lineage.activeFrontIds).toEqual(['BR1/07'])
    expect(lineage.historicalFrontIds).toEqual(['BR1/01', 'BR1/04'])
  })

  it('resolves independent lineages separately — other active fronts stay active alongside a continuation', () => {
    const masterData = buildMasterData()
    const setup = createFleetSetup(
      {
        fronts: [front('BR1/01'), front('BR1/02'), front('BR1/03'), front('BR1/04'), front('BR1/07')],
        fleets: [
          baseFleet('FLEET-1', 'BR1/01'),
          baseFleet('FLEET-2', 'BR1/02'),
          baseFleet('FLEET-3', 'BR1/03'),
          derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1'),
          derivedFleet('FLEET-7', 'BR1/07', 'FLEET-4'),
        ],
      },
      masterData,
    )
    expect(setup.ok).toBe(true)
    if (!setup.ok) return

    const lineage = deriveFrontLineage(setup.value)
    expect(lineage.activeFrontIds.slice().sort()).toEqual(['BR1/02', 'BR1/03', 'BR1/07'])
    expect(lineage.historicalFrontIds.slice().sort()).toEqual(['BR1/01', 'BR1/04'])
  })
})

describe('findFrontReferenceBranching', () => {
  it('finds no branching in a linear chain', () => {
    const input = {
      fronts: [front('BR1/01'), front('BR1/04')],
      fleets: [baseFleet('FLEET-1', 'BR1/01'), derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1')],
    }
    expect(findFrontReferenceBranching(input)).toBeUndefined()
  })

  it('detects two different Fronts both continuing from the same predecessor', () => {
    const input = {
      fronts: [front('BR1/01'), front('BR1/04'), front('BR1/05')],
      fleets: [
        baseFleet('FLEET-1', 'BR1/01'),
        derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1'),
        derivedFleet('FLEET-5', 'BR1/05', 'FLEET-1'),
      ],
    }
    expect(findFrontReferenceBranching(input)).toBe('BR1/01')
  })

  it('rejects branching via createFleetSetup with a stable domain error', () => {
    const masterData = buildMasterData()
    const result = createFleetSetup(
      {
        fronts: [front('BR1/01'), front('BR1/04'), front('BR1/05')],
        fleets: [
          baseFleet('FLEET-1', 'BR1/01'),
          derivedFleet('FLEET-4', 'BR1/04', 'FLEET-1'),
          derivedFleet('FLEET-5', 'BR1/05', 'FLEET-1'),
        ],
      },
      masterData,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_REFERENCE_BRANCHING')
  })

  it('does not flag two fleets on the SAME successor Front referencing two different fleets on the same predecessor', () => {
    const input = {
      fronts: [front('BR1/01'), front('BR1/04')],
      fleets: [
        baseFleet('FLEET-1', 'BR1/01'),
        baseFleet('FLEET-1B', 'BR1/01'),
        derivedFleet('FLEET-4A', 'BR1/04', 'FLEET-1'),
        derivedFleet('FLEET-4B', 'BR1/04', 'FLEET-1B'),
      ],
    }
    expect(findFrontReferenceBranching(input)).toBeUndefined()
  })
})
