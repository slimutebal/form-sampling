import { describe, expect, it } from 'vitest'
import { parseSectorCode } from '../common/codes'
import { parseFleetId, parseFrontId, parseTruckId } from '../common/identifiers'
import type { FleetId, FrontId, TruckId } from '../common/identifiers'
import { createMasterData, type MasterData } from '../master/master-data'
import { parseHaulerCode } from '../master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../master/references'
import { createFrontDefinition } from './front'
import { createBaseFleetDefinition, createDerivedFleetDefinition, type FleetDefinition } from './fleet-definition'
import { createFleetSetup, type FleetSetup } from './fleet-setup'
import { resolveEffectiveFleet, resolveEffectiveFleetAgainstMaster } from './fleet-resolution'

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

/** Builds MasterData with `count` trucks (T1..Tn) all belonging to H1, plus TX9 belonging to H2. */
function buildMasterData(count = 4): MasterData {
  const sector = parseSectorCode('S1')
  const haulerH1 = parseHaulerCode('H1')
  const haulerH2 = parseHaulerCode('H2')
  if (!sector.ok || !haulerH1.ok || !haulerH2.ok) throw new Error('invalid test fixture')

  const trucks = Array.from({ length: count }, (_, index) => createTruckReference(truckId(`T${index + 1}`), haulerH1.value))

  const result = createMasterData({
    employees: [],
    crews: [],
    sectors: [createSectorReference(sector.value)],
    locations: [],
    samplingHouses: [],
    pileAreas: [],
    haulers: [createHaulerReference(haulerH1.value), createHaulerReference(haulerH2.value)],
    trucks: [...trucks, createTruckReference(truckId('TX9'), haulerH2.value)],
    oreSamplingConfigs: [],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildFrontF1() {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  return createFrontDefinition(frontId('F1'), sector.value, hauler.value)
}

function base(id: string, truckIds: readonly TruckId[]): FleetDefinition {
  const result = createBaseFleetDefinition({ fleetId: fleetId(id), frontId: frontId('F1'), truckIds })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function derived(
  id: string,
  referenceId: string,
  addedTruckIds: readonly TruckId[],
  removedTruckIds: readonly TruckId[],
): FleetDefinition {
  const result = createDerivedFleetDefinition({
    fleetId: fleetId(id),
    frontId: frontId('F1'),
    referenceFleetId: fleetId(referenceId),
    addedTruckIds,
    removedTruckIds,
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildSetup(fleets: readonly FleetDefinition[], masterData: MasterData): FleetSetup {
  const result = createFleetSetup({ fronts: [buildFrontF1()], fleets }, masterData)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

describe('resolveEffectiveFleet', () => {
  it('BASE fleet: effective fleet equals the explicitly configured truckIds', () => {
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T3')])
    const setup = buildSetup([fleetA], buildMasterData())

    const result = resolveEffectiveFleet(setup, fleetId('FLEET-A'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckIds).toEqual(['T1', 'T2', 'T3'])
  })

  it('DERIVED fleet: effective fleet = reference effective + add - remove', () => {
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T3')])
    const fleetB = derived('FLEET-B', 'FLEET-A', [truckId('T4')], [truckId('T2')])
    const setup = buildSetup([fleetA, fleetB], buildMasterData())

    const result = resolveEffectiveFleet(setup, fleetId('FLEET-B'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckIds).toEqual(['T1', 'T3', 'T4'])
  })

  it('chained inheritance resolves through multiple derived fleets deterministically', () => {
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T3')])
    const fleetB = derived('FLEET-B', 'FLEET-A', [truckId('T4')], [truckId('T2')])
    const fleetC = derived('FLEET-C', 'FLEET-B', [truckId('T2')], [truckId('T1')])
    const setup = buildSetup([fleetA, fleetB, fleetC], buildMasterData())

    const result = resolveEffectiveFleet(setup, fleetId('FLEET-C'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckIds).toEqual(['T3', 'T4', 'T2'])
  })

  it('returns an explicit error for an unknown requested FleetId', () => {
    const setup = buildSetup([base('FLEET-A', [truckId('T1')])], buildMasterData())

    const result = resolveEffectiveFleet(setup, fleetId('FLEET-MISSING'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_NOT_FOUND')
  })

  it('does not mutate the base/reference fleet definitions or their truck arrays', () => {
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T3')])
    const fleetB = derived('FLEET-B', 'FLEET-A', [truckId('T4')], [truckId('T2')])
    const setup = buildSetup([fleetA, fleetB], buildMasterData())

    resolveEffectiveFleet(setup, fleetId('FLEET-B'))

    const storedA = setup.fleets.find((f) => f.fleetId === fleetId('FLEET-A'))
    const storedB = setup.fleets.find((f) => f.fleetId === fleetId('FLEET-B'))
    expect(storedA?.kind === 'BASE' && storedA.truckIds).toEqual(['T1', 'T2', 'T3'])
    expect(storedB?.kind === 'DERIVED' && storedB.addedTruckIds).toEqual(['T4'])
    expect(storedB?.kind === 'DERIVED' && storedB.removedTruckIds).toEqual(['T2'])
  })

  it('resolves a BASE fleet with more than 15 trucks with no legacy limit', () => {
    const truckIds = Array.from({ length: 20 }, (_, index) => truckId(`T${index + 1}`))
    const fleet = base('FLEET-BIG', truckIds)
    const setup = buildSetup([fleet], buildMasterData(20))

    const result = resolveEffectiveFleet(setup, fleetId('FLEET-BIG'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckIds).toHaveLength(20)
  })
})

describe('resolveEffectiveFleetAgainstMaster', () => {
  it('accepts an effective fleet whose trucks all exist and match the Front hauler', () => {
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T3')])
    const masterData = buildMasterData()
    const setup = buildSetup([fleetA], masterData)

    const result = resolveEffectiveFleetAgainstMaster(masterData, setup, fleetId('FLEET-A'))
    expect(result.ok).toBe(true)
  })

  it('rejects an effective fleet containing a TruckId unknown to master data', () => {
    const masterData = buildMasterData(3)
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('T2'), truckId('T999')])
    const setup = buildSetup([fleetA], masterData)

    const result = resolveEffectiveFleetAgainstMaster(masterData, setup, fleetId('FLEET-A'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TRUCK_NOT_FOUND_IN_MASTER')
  })

  it('rejects an effective fleet containing a truck from a different hauler than the Front', () => {
    const masterData = buildMasterData()
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('TX9')])
    const setup = buildSetup([fleetA], masterData)

    const result = resolveEffectiveFleetAgainstMaster(masterData, setup, fleetId('FLEET-A'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_HAULER_MISMATCH')
  })

  it('applies hauler consistency to inherited (derived) trucks as well', () => {
    const masterData = buildMasterData()
    const fleetA = base('FLEET-A', [truckId('T1'), truckId('TX9')])
    const fleetB = derived('FLEET-B', 'FLEET-A', [], [])
    const setup = buildSetup([fleetA, fleetB], masterData)

    const result = resolveEffectiveFleetAgainstMaster(masterData, setup, fleetId('FLEET-B'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_HAULER_MISMATCH')
  })
})
