import { describe, expect, it } from 'vitest'
import { parseSectorCode } from '../common/codes'
import { parseFleetId, parseFrontId, parseTruckId } from '../common/identifiers'
import type { FleetId, FrontId, TruckId } from '../common/identifiers'
import { createMasterData, type MasterData } from '../master/master-data'
import { parseHaulerCode } from '../master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../master/references'
import { createFrontDefinition } from './front'
import { createBaseFleetDefinition } from './fleet-definition'
import { createFleetSetup, type FleetSetup } from './fleet-setup'
import { findTrucksForHauler, validateTruckForFleet } from './truck-validation'

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

function buildSetup(masterData: MasterData): FleetSetup {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  const front = createFrontDefinition(frontId('F1'), sector.value, hauler.value)

  const fleet = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-A'),
    frontId: frontId('F1'),
    truckIds: [truckId('T1'), truckId('T3'), truckId('T4')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

/** A FleetSetup whose effective fleet contains T9, which belongs to a different hauler (H2) than Front F1 (H1). */
function buildSetupWithHaulerMismatchInEffectiveFleet(masterData: MasterData): FleetSetup {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  const front = createFrontDefinition(frontId('F1'), sector.value, hauler.value)

  const fleet = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-A'),
    frontId: frontId('F1'),
    truckIds: [truckId('T1'), truckId('T9')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

/** A FleetSetup whose effective fleet references T888, which does not exist in MasterData at all. */
function buildSetupWithUnknownEffectiveTruck(masterData: MasterData): FleetSetup {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  const front = createFrontDefinition(frontId('F1'), sector.value, hauler.value)

  const fleet = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-A'),
    frontId: frontId('F1'),
    truckIds: [truckId('T1'), truckId('T888')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

describe('findTrucksForHauler', () => {
  it('returns only master trucks matching the given HaulerCode', () => {
    const masterData = buildMasterData()
    const haulerH1 = parseHaulerCode('H1')
    if (!haulerH1.ok) throw new Error('invalid test fixture')

    const found = findTrucksForHauler(masterData, haulerH1.value)

    expect(found.map((t) => t.id).sort()).toEqual(['T1', 'T2', 'T3', 'T4'])
  })

  it('returns only the other hauler for a different HaulerCode', () => {
    const masterData = buildMasterData()
    const haulerH2 = parseHaulerCode('H2')
    if (!haulerH2.ok) throw new Error('invalid test fixture')

    const found = findTrucksForHauler(masterData, haulerH2.value)

    expect(found.map((t) => t.id)).toEqual(['T9'])
  })

  it('does not mutate MasterData while filtering', () => {
    const masterData = buildMasterData()
    const originalCount = masterData.trucks.length
    const haulerH1 = parseHaulerCode('H1')
    if (!haulerH1.ok) throw new Error('invalid test fixture')

    findTrucksForHauler(masterData, haulerH1.value)

    expect(masterData.trucks).toHaveLength(originalCount)
  })
})

describe('validateTruckForFleet', () => {
  it('classifies a truck within the effective fleet as VALID', () => {
    const masterData = buildMasterData()
    const setup = buildSetup(masterData)

    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T3'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('VALID')
  })

  it('classifies a known same-hauler truck outside the effective fleet as WRONG_TRUCK / NOT_IN_EFFECTIVE_FLEET', () => {
    const masterData = buildMasterData()
    const setup = buildSetup(masterData)

    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T2'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('WRONG_TRUCK')
    if (result.value.status !== 'WRONG_TRUCK') return
    expect(result.value.reasons).toContain('NOT_IN_EFFECTIVE_FLEET')
    expect(result.value.reasons).not.toContain('HAULER_MISMATCH')
  })

  it('classifies a truck from a different hauler as WRONG_TRUCK / HAULER_MISMATCH', () => {
    const masterData = buildMasterData()
    const setup = buildSetup(masterData)

    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T9'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('WRONG_TRUCK')
    if (result.value.status !== 'WRONG_TRUCK') return
    expect(result.value.reasons).toContain('HAULER_MISMATCH')
    expect(result.value.reasons).toContain('NOT_IN_EFFECTIVE_FLEET')
  })

  it('does not expose an allowed/blocked/canContinue policy field', () => {
    const masterData = buildMasterData()
    const setup = buildSetup(masterData)

    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T9'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toHaveProperty('allowed')
    expect(result.value).not.toHaveProperty('blocked')
    expect(result.value).not.toHaveProperty('canContinue')
  })

  it('returns an explicit domain error for a selected truck unknown to master data, not a WRONG_TRUCK classification', () => {
    const masterData = buildMasterData()
    const setup = buildSetup(masterData)

    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T999'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TRUCK_NOT_FOUND_IN_MASTER')
  })

  it('never classifies a valid selected truck as VALID when the effective fleet itself has a hauler-mismatched member', () => {
    const masterData = buildMasterData()
    const setup = buildSetupWithHaulerMismatchInEffectiveFleet(masterData)

    // T1 is itself a valid, same-hauler, in-fleet truck — but FLEET-A's
    // effective membership also contains T9 (hauler H2), which makes the
    // fleet setup itself master-inconsistent.
    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_HAULER_MISMATCH')
  })

  it('never classifies a valid selected truck as VALID when the effective fleet contains an unknown TruckId', () => {
    const masterData = buildMasterData()
    const setup = buildSetupWithUnknownEffectiveTruck(masterData)

    // T1 is itself a valid, known, in-fleet truck — but FLEET-A's
    // effective membership also contains T888, unknown to master data.
    const result = validateTruckForFleet(masterData, setup, fleetId('FLEET-A'), truckId('T1'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TRUCK_NOT_FOUND_IN_MASTER')
  })
})
