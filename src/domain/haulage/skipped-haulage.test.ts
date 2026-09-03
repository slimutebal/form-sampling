import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '../common/codes'
import {
  parseFleetId,
  parseFrontId,
  parseHaulageTransactionId,
  parsePileId,
  parseShiftId,
  parseTruckId,
} from '../common/identifiers'
import type { FleetId, FrontId, HaulageTransactionId, PileId, ShiftId, TruckId } from '../common/identifiers'
import type { OreCode } from '../common/codes'
import { createBatchPosition } from '../batch/batch-position'
import type { BatchPosition } from '../batch/batch-position'
import { parseBatchNumber } from '../batch/batch-number'
import { parseRitNumber } from '../batch/rit-number'
import { createFrontDefinition } from '../fleet/front'
import { createBaseFleetDefinition } from '../fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '../fleet/fleet-setup'
import { createMasterData, type MasterData } from '../master/master-data'
import { parseHaulerCode } from '../master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '../master/sampling-config'
import { createPile, type Pile } from '../pile/pile'
import { createHaulageTransaction, type HaulageTransaction } from './haulage-transaction'
import { findSkippedHaulagePositions } from './skipped-haulage'

function shiftId(value: string): ShiftId {
  const parsed = parseShiftId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function pileId(value: string): PileId {
  const parsed = parsePileId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

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

function transactionId(value: string): HaulageTransactionId {
  const parsed = parseHaulageTransactionId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function oreCode(value: string): OreCode {
  const parsed = parseOreCode(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function position(batch: number, rit: number): BatchPosition {
  const batchNumber = parseBatchNumber(batch)
  const ritNumber = parseRitNumber(rit)
  if (!batchNumber.ok || !ritNumber.ok) throw new Error('invalid test fixture')
  return createBatchPosition(batchNumber.value, ritNumber.value)
}

function buildMasterData(): MasterData {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  const sap = parseOreCode('SAP')
  if (!sector.ok || !hauler.ok || !sap.ok) throw new Error('invalid test fixture')

  const interval = parseSamplingInterval(2)
  const batchSize = parseBatchSize(20)
  const packing = parsePackingConfigValue(2)
  if (!interval.ok || !batchSize.ok || !packing.ok) throw new Error('invalid test fixture')

  const result = createMasterData({
    employees: [],
    crews: [],
    sectors: [createSectorReference(sector.value)],
    locations: [],
    samplingHouses: [],
    pileAreas: [],
    haulers: [createHaulerReference(hauler.value)],
    trucks: [createTruckReference(truckId('T1'), hauler.value)],
    oreSamplingConfigs: [
      createOreSamplingConfig({
        oreCode: sap.value,
        interval: interval.value,
        batchSize: batchSize.value,
        packing: packing.value,
      }),
    ],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildFleetSetup(masterData: MasterData): FleetSetup {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  const front = createFrontDefinition(frontId('F1'), sector.value, hauler.value)

  const fleet = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-A'),
    frontId: frontId('F1'),
    truckIds: [truckId('T1')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

const masterData = buildMasterData()
const fleetSetup = buildFleetSetup(masterData)
const pileA: Pile = createPile(pileId('PILE-A'), oreCode('SAP'))
const pileB: Pile = createPile(pileId('PILE-B'), oreCode('SAP'))

function buildTransaction(sid: ShiftId, pile: Pile, batch: number, rit: number): HaulageTransaction {
  const result = createHaulageTransaction({
    id: transactionId(`TX-${sid}-${pile.id}-${batch}-${rit}`),
    shiftId: sid,
    pile,
    batchPosition: position(batch, rit),
    fleetId: fleetId('FLEET-A'),
    truckId: truckId('T1'),
    masterData,
    fleetSetup,
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function toKeys(positions: readonly BatchPosition[]): string[] {
  return positions.map((p) => `${Number(p.batchNumber)}/${Number(p.ritNumber)}`)
}

describe('findSkippedHaulagePositions', () => {
  it('A. detects a simple internal gap and does not classify the tail as skipped', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 13), position(24, 14)]
    const transactions = [buildTransaction(shift, pileA, 24, 11), buildTransaction(shift, pileA, 24, 13)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(toKeys(result.value)).toEqual(['24/12'])
  })

  it('B. classifies nothing as skipped when only a tail is unrecorded', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 13), position(24, 14), position(24, 15)]
    const transactions = [buildTransaction(shift, pileA, 24, 11), buildTransaction(shift, pileA, 24, 12)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('C. detects every gap that has a later recorded position, across multiple internal gaps', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [
      position(24, 11),
      position(24, 12),
      position(24, 13),
      position(24, 14),
      position(24, 15),
      position(24, 16),
    ]
    const transactions = [
      buildTransaction(shift, pileA, 24, 11),
      buildTransaction(shift, pileA, 24, 14),
      buildTransaction(shift, pileA, 24, 16),
    ]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(toKeys(result.value)).toEqual(['24/12', '24/13', '24/15'])
  })

  it('D. detects a skipped position among legitimately non-contiguous pending batch numbers, without synthesizing gaps', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(25, 20), position(31, 20), position(32, 1)]
    const transactions = [buildTransaction(shift, pileA, 25, 20), buildTransaction(shift, pileA, 32, 1)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(toKeys(result.value)).toEqual(['31/20'])
  })

  it('E. reports no skipped positions when nothing at all has been recorded yet', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 13)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('F. reports no skipped positions when every expected position has been recorded', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 13)]
    const transactions = [
      buildTransaction(shift, pileA, 24, 11),
      buildTransaction(shift, pileA, 24, 12),
      buildTransaction(shift, pileA, 24, 13),
    ]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('G. a transaction belonging to a different Pile must not affect the target Pile result', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 13)]
    const transactions = [
      buildTransaction(shift, pileA, 24, 11),
      // Recorded for Pile-B at 24/13 — must be ignored when scoping to Pile-A,
      // otherwise 24/12 would incorrectly be classified skipped.
      buildTransaction(shift, pileB, 24, 13),
    ]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('H. a transaction belonging to a different Shift must not affect the target Shift result', () => {
    const shift1 = shiftId('SHIFT-1')
    const shift2 = shiftId('SHIFT-2')
    const expected = [position(24, 11), position(24, 12), position(24, 13)]
    const transactions = [
      buildTransaction(shift1, pileA, 24, 11),
      // Recorded for Shift-2 at 24/13 — must be ignored when scoping to Shift-1.
      buildTransaction(shift2, pileA, 24, 13),
    ]

    const result = findSkippedHaulagePositions({
      shiftId: shift1,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it('I. fails with RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE for an in-scope recorded position outside the expected sequence', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12)]
    const transactions = [buildTransaction(shift, pileA, 24, 15)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORDED_POSITION_NOT_IN_EXPECTED_SEQUENCE')
  })

  it('J. fails with DUPLICATE_EXPECTED_HAULAGE_POSITION when the expected sequence repeats a BatchPosition', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 11), position(24, 12), position(24, 12)]

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_EXPECTED_HAULAGE_POSITION')
  })

  it('K. never mutates or reorders the caller-owned expectedPositions or transactions arrays', () => {
    const shift = shiftId('SHIFT-1')
    const expected = [position(24, 16), position(24, 11), position(24, 14), position(24, 12), position(24, 13)]
    const transactions = [
      buildTransaction(shift, pileA, 24, 14),
      buildTransaction(shift, pileA, 24, 11),
      buildTransaction(shift, pileA, 24, 16),
    ]
    const expectedKeysBefore = toKeys(expected)
    const transactionIdsBefore = transactions.map((t) => t.id)

    const result = findSkippedHaulagePositions({
      shiftId: shift,
      pileId: pileA.id,
      expectedPositions: expected,
      transactions,
    })

    expect(result.ok).toBe(true)
    expect(toKeys(expected)).toEqual(expectedKeysBefore)
    expect(transactions.map((t) => t.id)).toEqual(transactionIdsBefore)
  })
})
