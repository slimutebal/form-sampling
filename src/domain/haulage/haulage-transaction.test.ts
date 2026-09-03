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
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
} from '../master/sampling-config'
import { createPile, type Pile } from '../pile/pile'
import {
  createHaulageTransaction,
  validateNoDuplicateHaulageTransactionIds,
  type HaulageTransaction,
  type HaulageTransactionData,
} from './haulage-transaction'

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
  const haulerH1 = parseHaulerCode('H1')
  const haulerH2 = parseHaulerCode('H2')
  const sap = parseOreCode('SAP')
  const lim = parseOreCode('LIM')
  const future = parseOreCode('FUTURE')
  if (!sector.ok || !haulerH1.ok || !haulerH2.ok || !sap.ok || !lim.ok || !future.ok) {
    throw new Error('invalid test fixture')
  }

  const sapInterval = parseSamplingInterval(2)
  const sapBatchSize = parseBatchSize(20)
  const sapPacking = parsePackingConfigValue(2)
  const limInterval = parseSamplingInterval(5)
  const limBatchSize = parseBatchSize(100)
  const limPacking = parsePackingConfigValue(10)
  const futureInterval = parseSamplingInterval(3)
  const futureBatchSize = parseBatchSize(30)
  const futurePacking = parsePackingConfigValue(3)
  if (
    !sapInterval.ok ||
    !sapBatchSize.ok ||
    !sapPacking.ok ||
    !limInterval.ok ||
    !limBatchSize.ok ||
    !limPacking.ok ||
    !futureInterval.ok ||
    !futureBatchSize.ok ||
    !futurePacking.ok
  ) {
    throw new Error('invalid test fixture')
  }

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
    oreSamplingConfigs: [
      createOreSamplingConfig({
        oreCode: sap.value,
        interval: sapInterval.value,
        batchSize: sapBatchSize.value,
        packing: sapPacking.value,
      }),
      createOreSamplingConfig({
        oreCode: lim.value,
        interval: limInterval.value,
        batchSize: limBatchSize.value,
        packing: limPacking.value,
      }),
      createOreSamplingConfig({
        oreCode: future.value,
        interval: futureInterval.value,
        batchSize: futureBatchSize.value,
        packing: futurePacking.value,
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
    truckIds: [truckId('T1'), truckId('T3'), truckId('T4')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

/** A FleetSetup whose effective fleet contains T9, hauler H2, under Front F2 (hauler H1) — an inconsistent fleet context. */
function buildFleetSetupWithInvalidEffectiveFleet(masterData: MasterData): FleetSetup {
  const sector = parseSectorCode('S1')
  const hauler = parseHaulerCode('H1')
  if (!sector.ok || !hauler.ok) throw new Error('invalid test fixture')
  const front = createFrontDefinition(frontId('F2'), sector.value, hauler.value)

  const fleet = createBaseFleetDefinition({
    fleetId: fleetId('FLEET-B'),
    frontId: frontId('F2'),
    truckIds: [truckId('T1'), truckId('T9')],
  })
  if (!fleet.ok) throw new Error('invalid test fixture')

  const setup = createFleetSetup({ fronts: [front], fleets: [fleet.value] }, masterData)
  if (!setup.ok) throw new Error('invalid test fixture')
  return setup.value
}

function buildSapPile(): Pile {
  return createPile(pileId('PILE-SAP'), oreCode('SAP'))
}

function buildLimPile(): Pile {
  return createPile(pileId('PILE-LIM'), oreCode('LIM'))
}

function buildFuturePile(): Pile {
  return createPile(pileId('PILE-FUTURE'), oreCode('FUTURE'))
}

function buildGhostOrePile(): Pile {
  return createPile(pileId('PILE-GHOST'), oreCode('GHOST'))
}

describe('createHaulageTransaction', () => {
  it('A. creates a valid SAP transaction with automatic sampling and VALID truck', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-001'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const tx = result.value
    expect(tx.shiftId).toBe('SHIFT-1')
    expect(tx.pileId).toBe('PILE-SAP')
    expect(Number(tx.batchPosition.batchNumber)).toBe(24)
    expect(Number(tx.batchPosition.ritNumber)).toBe(12)
    expect(tx.frontId).toBe('F1')
    expect(tx.fleetId).toBe('FLEET-A')
    expect(tx.truckId).toBe('T3')
    expect(tx.samplingEvaluation.sampleRequired).toBe(true)
    if (tx.samplingEvaluation.sampleRequired) {
      expect(Number(tx.samplingEvaluation.incrementNumber)).toBe(6)
    }
    expect(tx.truckValidation.status).toBe('VALID')
  })

  it('B. SAP non-sample rit produces sampleRequired false with no incrementNumber', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-002'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 11),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation.sampleRequired).toBe(false)
    expect(result.value.samplingEvaluation).not.toHaveProperty('incrementNumber')
  })

  it('C. LIM sample rit produces the correct incrementNumber', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-003'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildLimPile(),
      batchPosition: position(40, 100),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation.sampleRequired).toBe(true)
    if (result.value.samplingEvaluation.sampleRequired) {
      expect(Number(result.value.samplingEvaluation.incrementNumber)).toBe(20)
    }
  })

  it('D. a future/unknown ore config works identically, proving no SAP/LIM branching', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-004'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildFuturePile(),
      batchPosition: position(7, 6),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation.sampleRequired).toBe(true)
    if (result.value.samplingEvaluation.sampleRequired) {
      expect(Number(result.value.samplingEvaluation.incrementNumber)).toBe(2)
    }
  })

  it('E. fails with ORE_SAMPLING_CONFIG_NOT_FOUND when the Pile OreCode has no configuration', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-005'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildGhostOrePile(),
      batchPosition: position(1, 1),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })

  it('F. fails with RIT_EXCEEDS_BATCH_SIZE for a Rit beyond the configured batch size', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-006'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 21),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
  })

  it('G. a known same-hauler truck outside the effective fleet succeeds as WRONG_TRUCK / NOT_IN_EFFECTIVE_FLEET', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-007'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T2'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckId).toBe('T2')
    expect(result.value.truckValidation.status).toBe('WRONG_TRUCK')
    if (result.value.truckValidation.status !== 'WRONG_TRUCK') return
    expect(result.value.truckValidation.reasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    // Wrong Truck must not suppress or alter the sampling decision.
    expect(result.value.samplingEvaluation.sampleRequired).toBe(true)
  })

  it('H. a known truck from a different Hauler succeeds as WRONG_TRUCK with both reasons', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-008'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T9'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckValidation.status).toBe('WRONG_TRUCK')
    if (result.value.truckValidation.status !== 'WRONG_TRUCK') return
    expect(result.value.truckValidation.reasons).toContain('NOT_IN_EFFECTIVE_FLEET')
    expect(result.value.truckValidation.reasons).toContain('HAULER_MISMATCH')
    expect(result.value).not.toHaveProperty('allowed')
    expect(result.value).not.toHaveProperty('blocked')
    expect(result.value).not.toHaveProperty('canContinue')
  })

  it('I. fails with TRUCK_NOT_FOUND_IN_MASTER for an unknown selected truck, never producing a Wrong Truck transaction', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-009'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T999'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TRUCK_NOT_FOUND_IN_MASTER')
  })

  it('J. fails with the Phase 5 consistency error when the effective fleet itself is invalid against master data', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetupWithInvalidEffectiveFleet(masterData)

    // T1 would otherwise be a valid, known, same-hauler truck — but
    // FLEET-B's effective membership also contains T9 (hauler H2) under
    // a Front that requires H1, making the fleet setup itself invalid.
    const result = createHaulageTransaction({
      id: transactionId('TX-010'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-B'),
      truckId: truckId('T1'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FLEET_TRUCK_HAULER_MISMATCH')
  })

  it('K. FrontId is derived from the selected Fleet, not supplied independently', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-011'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.frontId).toBe('F1')
    expect(result.value).not.toHaveProperty('front')
  })

  it('L. preserves the exact externally supplied HaulageTransactionId', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-EXACT-ID-999'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('TX-EXACT-ID-999')
  })

  it('preserves ShiftId and PileId ownership', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)

    const result = createHaulageTransaction({
      id: transactionId('TX-012'),
      shiftId: shiftId('SHIFT-42'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftId).toBe('SHIFT-42')
    expect(result.value.pileId).toBe('PILE-SAP')
  })
})

describe('HaulageTransaction branding', () => {
  it('M. does not allow a raw structural object to be assigned directly as a HaulageTransaction', () => {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)
    const created = createHaulageTransaction({
      id: transactionId('TX-013'),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(24, 12),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })
    if (!created.ok) throw new Error('invalid test fixture')

    const raw: HaulageTransactionData = { ...created.value }

    // @ts-expect-error HaulageTransaction is only constructible via createHaulageTransaction(); a raw HaulageTransactionData must not be assignable directly.
    const notValidated: HaulageTransaction = raw

    expect(notValidated).toEqual(raw)
  })
})

describe('validateNoDuplicateHaulageTransactionIds', () => {
  function buildTransaction(id: string, batch: number, rit: number): HaulageTransaction {
    const masterData = buildMasterData()
    const fleetSetup = buildFleetSetup(masterData)
    const result = createHaulageTransaction({
      id: transactionId(id),
      shiftId: shiftId('SHIFT-1'),
      pile: buildSapPile(),
      batchPosition: position(batch, rit),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T3'),
      masterData,
      fleetSetup,
    })
    if (!result.ok) throw new Error('invalid test fixture')
    return result.value
  }

  it('accepts a collection with all-unique transaction IDs', () => {
    const transactions = [buildTransaction('TX-001', 24, 2), buildTransaction('TX-002', 24, 4), buildTransaction('TX-003', 24, 6)]

    const result = validateNoDuplicateHaulageTransactionIds(transactions)
    expect(result.ok).toBe(true)
  })

  it('rejects a collection containing a repeated transaction ID with DUPLICATE_HAULAGE_TRANSACTION_ID', () => {
    const transactions = [buildTransaction('TX-001', 24, 2), buildTransaction('TX-002', 24, 4), buildTransaction('TX-001', 24, 6)]

    const result = validateNoDuplicateHaulageTransactionIds(transactions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_HAULAGE_TRANSACTION_ID')
  })

  it('does not reject two different transaction IDs that share the same BatchPosition', () => {
    const transactions = [buildTransaction('TX-001', 24, 2), buildTransaction('TX-002', 24, 2)]

    const result = validateNoDuplicateHaulageTransactionIds(transactions)
    expect(result.ok).toBe(true)
  })
})
