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
import { resolveEffectiveFleet } from './fleet-resolution'

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
  const sector = parseSectorCode('S1')
  const haulerH1 = parseHaulerCode('H1')
  const haulerH2 = parseHaulerCode('H2')
  if (!sector.ok || !haulerH1.ok || !haulerH2.ok) throw new Error('invalid test fixture')

  const result = createMasterData({
    employees: [],
    crews: [],
    sectors: [createSectorReference(sector.value)],
    locations: [],
    samplingHouses: [],
    pileAreas: [],
    haulers: [createHaulerReference(haulerH1.value), createHaulerReference(haulerH2.value)],
    trucks: [
      createTruckReference(truckId('T1'), haulerH1.value),
      createTruckReference(truckId('T2'), haulerH1.value),
      createTruckReference(truckId('T3'), haulerH1.value),
      createTruckReference(truckId('T4'), haulerH1.value),
      createTruckReference(truckId('T9'), haulerH2.value),
    ],
    oreSamplingConfigs: [],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildFrontF1(): FrontDefinition {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  return createFrontDefinition(frontId('F1'), sector.value, hauler.value)
}

function baseFleetA(): FleetDefinition {
  const result = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-A'),
    frontId: frontId('F1'),
    truckIds: [truckId('T1'), truckId('T2'), truckId('T3')],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

describe('createFleetSetup', () => {
  it('accepts a valid single-front, single-fleet setup', () => {
    const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [baseFleetA()] }, buildMasterData())
    expect(result.ok).toBe(true)
  })

  it('rejects a duplicate FrontId', () => {
    const front = buildFrontF1()
    const result = createFleetSetup({ fronts: [front, front], fleets: [] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FRONT_ID')
  })

  it('rejects a duplicate FleetId', () => {
    const fleetA = baseFleetA()
    const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [fleetA, fleetA] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_ID')
  })

  it('rejects a Front referencing an unknown SectorCode', () => {
    const hauler = parseHaulerCode('H1')
    const unknownSector = parseSectorCode('UNKNOWN')
    if (!hauler.ok || !unknownSector.ok) throw new Error('invalid test fixture')
    const front = createFrontDefinition(frontId('F1'), unknownSector.value, hauler.value)

    const result = createFleetSetup({ fronts: [front], fleets: [] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_SECTOR_NOT_FOUND')
  })

  it('rejects a Front referencing an unknown HaulerCode', () => {
    const sector = parseSectorCode('S1')
    const unknownHauler = parseHaulerCode('UNKNOWN')
    if (!sector.ok || !unknownHauler.ok) throw new Error('invalid test fixture')
    const front = createFrontDefinition(frontId('F1'), sector.value, unknownHauler.value)

    const result = createFleetSetup({ fronts: [front], fleets: [] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_HAULER_NOT_FOUND')
  })

  it('rejects a fleet referencing an unknown FrontId', () => {
    const orphanFleet = createBaseFleetDefinition({
      fleetId: fleetId('FLEET-A'),
      frontId: frontId('UNKNOWN_FRONT'),
      truckIds: [],
    })
    if (!orphanFleet.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [orphanFleet.value] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_FRONT_NOT_FOUND')
  })

  it('allows multiple fleets to belong to the same Front', () => {
    const fleetA = baseFleetA()
    const fleetOther = createBaseFleetDefinition({
      fleetId: fleetId('FLEET-OTHER'),
      frontId: frontId('F1'),
      truckIds: [truckId('T4')],
    })
    if (!fleetOther.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup(
      { fronts: [buildFrontF1()], fleets: [fleetA, fleetOther.value] },
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a DERIVED fleet referencing an unknown FleetId', () => {
    const derived = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-B'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-MISSING'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    if (!derived.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [derived.value] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_REFERENCE_NOT_FOUND')
  })

  it('rejects a self-referencing fleet (A -> A) as a cycle', () => {
    const selfRef = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-A'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-A'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    if (!selfRef.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [selfRef.value] }, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_REFERENCE_CYCLE')
  })

  it('rejects a multi-fleet cycle (A -> B -> C -> A)', () => {
    const a = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-A'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-C'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    const b = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-B'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-A'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    const c = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-C'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-B'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    if (!a.ok || !b.ok || !c.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup(
      { fronts: [buildFrontF1()], fleets: [a.value, b.value, c.value] },
      buildMasterData(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_REFERENCE_CYCLE')
  })

  it('does not require a DERIVED fleet to reference a fleet on the same Front', () => {
    const sector = parseSectorCode('S1')
    const hauler = parseHaulerCode('H1')
    if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
    const frontF2 = createFrontDefinition(frontId('F2'), sector.value, hauler.value)

    const derived = createDerivedFleetDefinition({
      fleetId: fleetId('FLEET-B'),
      frontId: frontId('F2'),
      referenceFleetId: fleetId('FLEET-A'),
      addedTruckIds: [],
      removedTruckIds: [],
    })
    if (!derived.ok) throw new Error('invalid test fixture')

    const result = createFleetSetup(
      { fronts: [buildFrontF1(), frontF2], fleets: [baseFleetA(), derived.value] },
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
  })

  it('isolates the snapshot from later mutation of the caller-owned fronts/fleets arrays', () => {
    const fronts = [buildFrontF1()]
    const fleets = [baseFleetA()]

    const result = createFleetSetup({ fronts, fleets }, buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const extraFront = createFrontDefinition(
      frontId('F2'),
      (() => {
        const sector = parseSectorCode('S1')
        if (!sector.ok) throw new Error('invalid test fixture')
        return sector.value
      })(),
      (() => {
        const hauler = parseHaulerCode('H1')
        if (!hauler.ok) throw new Error('invalid test fixture')
        return hauler.value
      })(),
    )
    fronts.push(extraFront)
    fleets.push(baseFleetA())

    expect(result.value.fronts).toHaveLength(1)
    expect(result.value.fleets).toHaveLength(1)
  })

  describe('raw (non-factory-built) FleetDefinition structural validation', () => {
    it('rejects a raw BASE fleet with a duplicate TruckId, bypassing createBaseFleetDefinition', () => {
      const rawFleet: FleetDefinition = {
        kind: 'BASE',
        fleetId: fleetId('FLEET-A'),
        frontId: frontId('F1'),
        truckIds: [truckId('T1'), truckId('T1')],
      }

      const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [rawFleet] }, buildMasterData())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
    })

    it('rejects a raw DERIVED fleet with a duplicate addedTruckIds entry, bypassing createDerivedFleetDefinition', () => {
      const rawFleet: FleetDefinition = {
        kind: 'DERIVED',
        fleetId: fleetId('FLEET-B'),
        frontId: frontId('F1'),
        referenceFleetId: fleetId('FLEET-A'),
        addedTruckIds: [truckId('T4'), truckId('T4')],
        removedTruckIds: [],
      }

      const result = createFleetSetup(
        { fronts: [buildFrontF1()], fleets: [baseFleetA(), rawFleet] },
        buildMasterData(),
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
    })

    it('rejects a raw DERIVED fleet with a duplicate removedTruckIds entry, bypassing createDerivedFleetDefinition', () => {
      const rawFleet: FleetDefinition = {
        kind: 'DERIVED',
        fleetId: fleetId('FLEET-B'),
        frontId: frontId('F1'),
        referenceFleetId: fleetId('FLEET-A'),
        addedTruckIds: [],
        removedTruckIds: [truckId('T2'), truckId('T2')],
      }

      const result = createFleetSetup(
        { fronts: [buildFrontF1()], fleets: [baseFleetA(), rawFleet] },
        buildMasterData(),
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
    })

    it('rejects a raw DERIVED fleet with the same TruckId in both add and remove, bypassing createDerivedFleetDefinition', () => {
      const rawFleet: FleetDefinition = {
        kind: 'DERIVED',
        fleetId: fleetId('FLEET-B'),
        frontId: frontId('F1'),
        referenceFleetId: fleetId('FLEET-A'),
        addedTruckIds: [truckId('T2')],
        removedTruckIds: [truckId('T2')],
      }

      const result = createFleetSetup(
        { fronts: [buildFrontF1()], fleets: [baseFleetA(), rawFleet] },
        buildMasterData(),
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('CONTRADICTORY_FLEET_DELTA')
    })
  })

  describe('nested-array snapshot isolation', () => {
    it('isolates a BASE fleet effective membership from later mutation of the caller-owned truckIds array', () => {
      const truckIds = [truckId('T1'), truckId('T2')]
      const rawFleet: FleetDefinition = {
        kind: 'BASE',
        fleetId: fleetId('FLEET-A'),
        frontId: frontId('F1'),
        truckIds,
      }

      const result = createFleetSetup({ fronts: [buildFrontF1()], fleets: [rawFleet] }, buildMasterData())
      expect(result.ok).toBe(true)
      if (!result.ok) return

      truckIds.push(truckId('T3'))

      const storedFleet = result.value.fleets.find((f) => f.fleetId === fleetId('FLEET-A'))
      expect(storedFleet?.kind === 'BASE' && storedFleet.truckIds).toEqual(['T1', 'T2'])

      const effective = resolveEffectiveFleet(result.value, fleetId('FLEET-A'))
      expect(effective.ok).toBe(true)
      if (!effective.ok) return
      expect(effective.value.truckIds).toEqual(['T1', 'T2'])
    })

    it('isolates a DERIVED fleet delta from later mutation of the caller-owned add/remove arrays', () => {
      const addedTruckIds = [truckId('T4')]
      const removedTruckIds = [truckId('T2')]
      const rawFleet: FleetDefinition = {
        kind: 'DERIVED',
        fleetId: fleetId('FLEET-B'),
        frontId: frontId('F1'),
        referenceFleetId: fleetId('FLEET-A'),
        addedTruckIds,
        removedTruckIds,
      }

      const result = createFleetSetup(
        { fronts: [buildFrontF1()], fleets: [baseFleetA(), rawFleet] },
        buildMasterData(),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      addedTruckIds.push(truckId('T5'))
      removedTruckIds.push(truckId('T3'))

      const storedFleet = result.value.fleets.find((f) => f.fleetId === fleetId('FLEET-B'))
      expect(storedFleet?.kind === 'DERIVED' && storedFleet.addedTruckIds).toEqual(['T4'])
      expect(storedFleet?.kind === 'DERIVED' && storedFleet.removedTruckIds).toEqual(['T2'])
    })
  })
})
