import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '../common/codes'
import {
  parseEmployeeId,
  parseFleetId,
  parseFrontId,
  parseHaulageTransactionId,
  parsePileId,
  parseShiftId,
  parseTruckId,
} from '../common/identifiers'
import type { EmployeeId, FleetId, FrontId, HaulageTransactionId, PileId, ShiftId, TruckId } from '../common/identifiers'
import { createBatchPosition, type BatchPosition } from '../batch/batch-position'
import { parseBatchNumber } from '../batch/batch-number'
import { parseRitNumber } from '../batch/rit-number'
import { createFrontDefinition } from '../fleet/front'
import { createBaseFleetDefinition } from '../fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '../fleet/fleet-setup'
import { createHaulageTransaction, type HaulageTransaction } from '../haulage/haulage-transaction'
import { createMasterData, type MasterData } from '../master/master-data'
import { parseHaulerCode } from '../master/master-codes'
import { createHaulerReference, createSectorReference, createTruckReference } from '../master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '../master/sampling-config'
import { createPile, type Pile } from '../pile/pile'
import {
  CONTAMINATIONS,
  DISPOSITIONS,
  PHYSICAL_CONDITIONS,
  createLegacyProductionRecord,
  createProductionRecord,
} from './production-record'

function must<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.error)}`)
  return result.value as T
}

function shiftId(value: string): ShiftId {
  return must(parseShiftId(value))
}
function pileId(value: string): PileId {
  return must(parsePileId(value))
}
function truckId(value: string): TruckId {
  return must(parseTruckId(value))
}
function fleetId(value: string): FleetId {
  return must(parseFleetId(value))
}
function frontId(value: string): FrontId {
  return must(parseFrontId(value))
}
function transactionId(value: string): HaulageTransactionId {
  return must(parseHaulageTransactionId(value))
}
function employeeId(value: string): EmployeeId {
  return must(parseEmployeeId(value))
}
function position(batch: number, rit: number): BatchPosition {
  return createBatchPosition(must(parseBatchNumber(batch)), must(parseRitNumber(rit)))
}

function buildMasterData(): MasterData {
  const sector = must(parseSectorCode('S1'))
  const hauler = must(parseHaulerCode('H1'))
  const sap = must(parseOreCode('SAP'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [createHaulerReference(hauler)],
      trucks: [createTruckReference(truckId('T1'), hauler)],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function buildFleetSetup(masterData: MasterData): FleetSetup {
  const sector = must(parseSectorCode('S1'))
  const hauler = must(parseHaulerCode('H1'))
  const front = createFrontDefinition(frontId('F1'), sector, hauler)
  const fleet = must(
    createBaseFleetDefinition({ fleetId: fleetId('FLEET-A'), frontId: frontId('F1'), truckIds: [truckId('T1')] }),
  )
  return must(createFleetSetup({ fronts: [front], fleets: [fleet] }, masterData))
}

function buildPile(): Pile {
  return createPile(pileId('PILE-1'), must(parseOreCode('SAP')))
}

function buildTransaction(id = 'TX-1'): HaulageTransaction {
  const masterData = buildMasterData()
  const fleetSetup = buildFleetSetup(masterData)
  return must(
    createHaulageTransaction({
      id: transactionId(id),
      shiftId: shiftId('SHIFT-1'),
      pile: buildPile(),
      batchPosition: position(1, 1),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T1'),
      masterData,
      fleetSetup,
    }),
  )
}

describe('createProductionRecord', () => {
  it('creates a valid ProductionRecord from required fields', () => {
    const transaction = buildTransaction()
    const createdAt = new Date('2026-09-04T10:00:00.000Z')
    const result = createProductionRecord({
      transaction,
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt,
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction).toBe(transaction)
    expect(result.value.effective.batchPosition).toBe(transaction.batchPosition)
    expect(result.value.effective.frontId).toBe(transaction.frontId)
    expect(result.value.effective.fleetId).toBe(transaction.fleetId)
    expect(result.value.effective.truckId).toBe(transaction.truckId)
    expect(result.value.effective.physicalCondition).toBe('DRY')
    expect(result.value.effective.contamination).toBe('CLN')
    expect(result.value.effective.disposition).toBe('ACCEPT')
    expect(result.value.effective.remark).toBeNull()
    expect(result.value.effective.status).toBe('ACTIVE')
    expect(result.value.audit.createdAt).toEqual(createdAt)
    expect(result.value.audit.createdBy).toBe('EMP-1')
    expect(result.value.audit.updatedAt).toBeNull()
    expect(result.value.audit.updatedBy).toBeNull()
  })

  it('the transaction embedded in a new ProductionRecord is the same immutable original', () => {
    const transaction = buildTransaction()
    const result = createProductionRecord({
      transaction,
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction).toEqual(transaction)
  })

  it('the corrections collection starts empty', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.audit.corrections).toEqual([])
  })

  for (const physicalCondition of PHYSICAL_CONDITIONS) {
    it(`accepts PhysicalCondition ${physicalCondition}`, () => {
      const result = createProductionRecord({
        transaction: buildTransaction(),
        physicalCondition,
        contamination: 'CLN',
        disposition: 'ACCEPT',
        createdAt: new Date(),
        createdBy: employeeId('EMP-1'),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.effective.physicalCondition).toBe(physicalCondition)
    })
  }

  for (const contamination of CONTAMINATIONS) {
    it(`accepts Contamination ${contamination}`, () => {
      const result = createProductionRecord({
        transaction: buildTransaction(),
        physicalCondition: 'DRY',
        contamination,
        disposition: 'ACCEPT',
        createdAt: new Date(),
        createdBy: employeeId('EMP-1'),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.effective.contamination).toBe(contamination)
    })
  }

  for (const disposition of DISPOSITIONS) {
    it(`accepts Disposition ${disposition}`, () => {
      const result = createProductionRecord({
        transaction: buildTransaction(),
        physicalCondition: 'DRY',
        contamination: 'CLN',
        disposition,
        createdAt: new Date(),
        createdBy: employeeId('EMP-1'),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.effective.disposition).toBe(disposition)
    })
  }

  it('normalizes a blank remark to null', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      remark: '   ',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.remark).toBeNull()
  })

  it('normalizes an omitted remark to null', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.remark).toBeNull()
  })

  it('preserves a non-blank remark, trimmed', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      remark: '  needs review  ',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.remark).toBe('needs review')
  })

  it('rejects an invalid PhysicalCondition', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'SOAKED' as never,
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_PHYSICAL_CONDITION')
  })

  it('rejects an invalid Contamination', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'DIRTY' as never,
      disposition: 'ACCEPT',
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_CONTAMINATION')
  })

  it('rejects an invalid Disposition', () => {
    const result = createProductionRecord({
      transaction: buildTransaction(),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'MAYBE' as never,
      createdAt: new Date(),
      createdBy: employeeId('EMP-1'),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_DISPOSITION')
  })
})

describe('createLegacyProductionRecord', () => {
  it('preserves the original transaction exactly', () => {
    const transaction = buildTransaction()
    const record = createLegacyProductionRecord(transaction)
    expect(record.transaction).toBe(transaction)
  })

  it('defaults effective batch/front/fleet/truck to the original transaction', () => {
    const transaction = buildTransaction()
    const record = createLegacyProductionRecord(transaction)
    expect(record.effective.batchPosition).toBe(transaction.batchPosition)
    expect(record.effective.frontId).toBe(transaction.frontId)
    expect(record.effective.fleetId).toBe(transaction.fleetId)
    expect(record.effective.truckId).toBe(transaction.truckId)
  })

  it('sets disposition ACCEPT, status ACTIVE, and physicalCondition/contamination/remark to null', () => {
    const record = createLegacyProductionRecord(buildTransaction())
    expect(record.effective.disposition).toBe('ACCEPT')
    expect(record.effective.status).toBe('ACTIVE')
    expect(record.effective.physicalCondition).toBeNull()
    expect(record.effective.contamination).toBeNull()
    expect(record.effective.remark).toBeNull()
  })

  it('sets every audit field to null and corrections to empty', () => {
    const record = createLegacyProductionRecord(buildTransaction())
    expect(record.audit.createdAt).toBeNull()
    expect(record.audit.createdBy).toBeNull()
    expect(record.audit.updatedAt).toBeNull()
    expect(record.audit.updatedBy).toBeNull()
    expect(record.audit.corrections).toEqual([])
  })
})
