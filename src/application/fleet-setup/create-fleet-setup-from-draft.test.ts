import { describe, expect, it } from 'vitest'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createShift, type Shift } from '@/domain/shift/shift'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildShift(): Shift {
  return createShift({
    id: value(parseShiftId('SHIFT-1')),
    date: value(parseShiftDate('2026-09-04')),
    shiftCode: value(parseShiftCode('D')),
    sectorCode: value(parseSectorCode('S1')),
    samplingHouseCode: value(parseSamplingHouseCode('SH1')),
    status: 'NEW',
  })
}

function buildMasterData(h1TruckCount = 20): MasterData {
  const h1 = value(parseHaulerCode('H1'))
  const h2 = value(parseHaulerCode('H2'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      oreSamplingConfigs: [],
      sectors: [createSectorReference(value(parseSectorCode('S1')))],
      haulers: [createHaulerReference(h1), createHaulerReference(h2)],
      trucks: [
        ...Array.from({ length: h1TruckCount }, (_, index) =>
          createTruckReference(value(parseTruckId(`T${index + 1}`)), h1),
        ),
        createTruckReference(value(parseTruckId('H2-T1')), h2),
      ],
    }),
  )
}

function base(
  fleetId: string,
  frontId: string,
  truckIds: readonly string[],
  haulerCode = 'H1',
): FleetSetupDraftEntry {
  return {
    fleetId,
    frontId,
    haulerCode,
    kind: 'BASE',
    referenceFleetId: '',
    truckIds,
    addedTruckIds: [],
    removedTruckIds: [],
  }
}

function derived(
  fleetId: string,
  frontId: string,
  referenceFleetId: string,
  addedTruckIds: readonly string[],
  removedTruckIds: readonly string[],
): FleetSetupDraftEntry {
  return {
    fleetId,
    frontId,
    haulerCode: 'H1',
    kind: 'DERIVED',
    referenceFleetId,
    truckIds: [],
    addedTruckIds,
    removedTruckIds,
  }
}

describe('createFleetSetupFromDraft', () => {
  it('builds a BASE front using the Shift sector', () => {
    const result = createFleetSetupFromDraft(
      [base('FLEET-1', 'F1', ['T1', 'T2', 'T3'])],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts[0]).toMatchObject({
      frontId: 'F1',
      sectorCode: 'S1',
      haulerCode: 'H1',
    })
    expect(result.value.fleetSetup.fleets[0]).toMatchObject({
      kind: 'BASE',
      truckIds: ['T1', 'T2', 'T3'],
    })
  })

  it('resolves a DERIVED fleet with explicit add and remove', () => {
    const result = createFleetSetupFromDraft(
      [
        base('FLEET-1', 'F1', ['T1', 'T2', 'T3']),
        derived('FLEET-2', 'F2', 'FLEET-1', ['T4'], ['T2']),
      ],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleets[1]?.truckIds).toEqual(['T1', 'T3', 'T4'])
  })

  it('resolves chained inheritance in domain order', () => {
    const result = createFleetSetupFromDraft(
      [
        base('FLEET-1', 'F1', ['T1', 'T2', 'T3']),
        derived('FLEET-2', 'F2', 'FLEET-1', ['T4'], ['T2']),
        derived('FLEET-3', 'F3', 'FLEET-2', ['T2'], ['T1']),
      ],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleets[2]?.truckIds).toEqual(['T3', 'T4', 'T2'])
  })

  it.each([
    [
      'duplicate Front ID',
      [base('A', 'F1', ['T1']), base('B', 'F1', ['T2'])],
      'DUPLICATE_FRONT_ID',
    ],
    ['duplicate truck', [base('A', 'F1', ['T1', 'T1'])], 'DUPLICATE_FLEET_TRUCK'],
    [
      'contradictory delta',
      [base('A', 'F1', ['T1']), derived('B', 'F2', 'A', ['T2'], ['T2'])],
      'CONTRADICTORY_FLEET_DELTA',
    ],
    [
      'reference cycle',
      [derived('A', 'F1', 'B', [], []), derived('B', 'F2', 'A', [], [])],
      'FLEET_REFERENCE_CYCLE',
    ],
    ['hauler mismatch', [base('A', 'F1', ['H2-T1'])], 'FLEET_TRUCK_HAULER_MISMATCH'],
    ['unknown effective truck', [base('A', 'F1', ['UNKNOWN'])], 'TRUCK_NOT_FOUND_IN_MASTER'],
  ] as const)('rejects %s', (_label, entries, code) => {
    const result = createFleetSetupFromDraft(entries, buildShift(), buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(code)
  })

  it('accepts a 20-truck BASE fleet without a legacy limit', () => {
    const trucks = Array.from({ length: 20 }, (_, index) => `T${index + 1}`)
    const result = createFleetSetupFromDraft(
      [base('A', 'F1', trucks)],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleets[0]?.truckIds).toHaveLength(20)
  })

  it('uses Shift sector for every Front and does not mutate caller arrays', () => {
    const trucks = ['T1', 'T2']
    const entries = [base('A', 'F1', trucks), derived('B', 'F2', 'A', ['T3'], [])]
    const result = createFleetSetupFromDraft(entries, buildShift(), buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts.every((front) => front.sectorCode === 'S1')).toBe(true)
    expect(trucks).toEqual(['T1', 'T2'])
    expect(entries[0]?.truckIds).toBe(trucks)
  })
})
