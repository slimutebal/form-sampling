import { describe, expect, it } from 'vitest'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parsePileId, parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import {
  createHaulerReference,
  createPileAreaReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
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
  const sectorCode = value(parseSectorCode('S1'))
  return value(
    createMasterData({
      employees: [],
      crews: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [
        createPileAreaReference(
          sectorCode,
          value(parsePileAreaCode('STOCK-1')),
          value(parsePileId('PILE-1')),
          value(parseOreCode('SAP')),
        ),
      ],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: value(parseOreCode('SAP')),
          interval: value(parseSamplingInterval(2)),
          batchSize: value(parseBatchSize(20)),
          packing: value(parsePackingConfigValue(2)),
        }),
      ],
      sectors: [createSectorReference(sectorCode)],
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
  frontNumber: string,
  truckIds: readonly string[],
  haulerCode = 'H1',
  destinationPileId = '',
): FleetSetupDraftEntry {
  return {
    fleetId,
    frontNumber,
    destinationPileId,
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
  frontNumber: string,
  referenceFleetId: string,
  addedTruckIds: readonly string[],
  removedTruckIds: readonly string[],
): FleetSetupDraftEntry {
  return {
    fleetId,
    frontNumber,
    destinationPileId: '',
    haulerCode: 'H1',
    kind: 'DERIVED',
    referenceFleetId,
    truckIds: [],
    addedTruckIds,
    removedTruckIds,
  }
}

describe('createFleetSetupFromDraft', () => {
  it('builds a BASE front using the Shift sector, deriving FrontId from Sector + Front No', () => {
    const result = createFleetSetupFromDraft(
      [base('FLEET-1', '01', ['T1', 'T2', 'T3'])],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts[0]).toMatchObject({
      frontId: 'S1/01',
      sectorCode: 'S1',
      haulerCode: 'H1',
    })
    expect(result.value.fleetSetup.fleets[0]).toMatchObject({
      kind: 'BASE',
      truckIds: ['T1', 'T2', 'T3'],
    })
  })

  it('derives FrontId "S1/25" for Front No 25 and rejects Front No 0/26', () => {
    const ok = createFleetSetupFromDraft([base('FLEET-1', '25', ['T1'])], buildShift(), buildMasterData())
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.fleetSetup.fronts[0]?.frontId).toBe('S1/25')

    const tooLow = createFleetSetupFromDraft([base('FLEET-1', '0', ['T1'])], buildShift(), buildMasterData())
    expect(tooLow.ok).toBe(false)
    if (!tooLow.ok) expect(tooLow.error.code).toBe('FRONT_NUMBER_OUT_OF_RANGE')

    const tooHigh = createFleetSetupFromDraft([base('FLEET-1', '26', ['T1'])], buildShift(), buildMasterData())
    expect(tooHigh.ok).toBe(false)
    if (!tooHigh.ok) expect(tooHigh.error.code).toBe('FRONT_NUMBER_OUT_OF_RANGE')
  })

  it('resolves a valid Destination/Pile to its master Ore/Stockpile, never retyped', () => {
    const result = createFleetSetupFromDraft(
      [base('FLEET-1', '01', ['T1'], 'H1', 'PILE-1')],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts[0]?.destinationPileId).toBe('PILE-1')
  })

  it('leaves destinationPileId undefined when blank (a Front may have no destination)', () => {
    const result = createFleetSetupFromDraft([base('FLEET-1', '01', ['T1'])], buildShift(), buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts[0]?.destinationPileId).toBeUndefined()
  })

  it('rejects a Destination/Pile that does not exist in master', () => {
    const result = createFleetSetupFromDraft(
      [base('FLEET-1', '01', ['T1'], 'H1', 'NO-SUCH-PILE')],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_DESTINATION_PILE_NOT_FOUND')
  })

  it('rejects a DERIVED entry with a blank reference, even though the UI can no longer produce one', () => {
    const entries: FleetSetupDraftEntry[] = [
      { ...derived('FLEET-1', '01', '', [], []) },
    ]
    const result = createFleetSetupFromDraft(entries, buildShift(), buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_REFERENCE_REQUIRED')
  })

  it('resolves a DERIVED fleet with explicit add and remove', () => {
    const result = createFleetSetupFromDraft(
      [
        base('FLEET-1', '01', ['T1', 'T2', 'T3']),
        derived('FLEET-2', '02', 'FLEET-1', ['T4'], ['T2']),
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
        base('FLEET-1', '01', ['T1', 'T2', 'T3']),
        derived('FLEET-2', '02', 'FLEET-1', ['T4'], ['T2']),
        derived('FLEET-3', '03', 'FLEET-2', ['T2'], ['T1']),
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
      'duplicate Front No',
      [base('A', '01', ['T1']), base('B', '01', ['T2'])],
      'DUPLICATE_FRONT_ID',
    ],
    ['duplicate truck', [base('A', '01', ['T1', 'T1'])], 'DUPLICATE_FLEET_TRUCK'],
    [
      'contradictory delta',
      [base('A', '01', ['T1']), derived('B', '02', 'A', ['T2'], ['T2'])],
      'CONTRADICTORY_FLEET_DELTA',
    ],
    [
      'reference cycle',
      [derived('A', '01', 'B', [], []), derived('B', '02', 'A', [], [])],
      'FLEET_REFERENCE_CYCLE',
    ],
    ['hauler mismatch', [base('A', '01', ['H2-T1'])], 'FLEET_TRUCK_HAULER_MISMATCH'],
    ['unknown effective truck', [base('A', '01', ['UNKNOWN'])], 'TRUCK_NOT_FOUND_IN_MASTER'],
  ] as const)('rejects %s', (_label, entries, code) => {
    const result = createFleetSetupFromDraft(entries, buildShift(), buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(code)
  })

  it('accepts a 20-truck BASE fleet without a legacy limit', () => {
    const trucks = Array.from({ length: 20 }, (_, index) => `T${index + 1}`)
    const result = createFleetSetupFromDraft(
      [base('A', '01', trucks)],
      buildShift(),
      buildMasterData(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effectiveFleets[0]?.truckIds).toHaveLength(20)
  })

  it('uses Shift sector for every Front and does not mutate caller arrays', () => {
    const trucks = ['T1', 'T2']
    const entries = [base('A', '01', trucks), derived('B', '02', 'A', ['T3'], [])]
    const result = createFleetSetupFromDraft(entries, buildShift(), buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fleetSetup.fronts.every((front) => front.sectorCode === 'S1')).toBe(true)
    expect(trucks).toEqual(['T1', 'T2'])
    expect(entries[0]?.truckIds).toBe(trucks)
  })
})
