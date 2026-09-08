import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '../common/codes'
import {
  parseEmployeeId,
  parseFleetId,
  parseFrontId,
  parseHaulageTransactionId,
  parseProductionCorrectionId,
  parsePileId,
  parseShiftId,
  parseTruckId,
} from '../common/identifiers'
import type {
  EmployeeId,
  FleetId,
  FrontId,
  HaulageTransactionId,
  PileId,
  ProductionCorrectionId,
  ShiftId,
  TruckId,
} from '../common/identifiers'
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
import { createProductionRecord, type ProductionRecord } from './production-record'
import { applyEditFields, applySwitchPosition, applyVoidRecord } from './production-correction'

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
function correctionId(value: string): ProductionCorrectionId {
  return must(parseProductionCorrectionId(value))
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
      trucks: [createTruckReference(truckId('T1'), hauler), createTruckReference(truckId('T2'), hauler)],
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

function buildTransaction(id = 'TX-1', batch = 1, rit = 1): HaulageTransaction {
  const masterData = buildMasterData()
  const fleetSetup = buildFleetSetup(masterData)
  return must(
    createHaulageTransaction({
      id: transactionId(id),
      shiftId: shiftId('SHIFT-1'),
      pile: buildPile(),
      batchPosition: position(batch, rit),
      fleetId: fleetId('FLEET-A'),
      truckId: truckId('T1'),
      masterData,
      fleetSetup,
    }),
  )
}

function buildRecord(id = 'TX-1', batch = 1, rit = 1): ProductionRecord {
  return must(
    createProductionRecord({
      transaction: buildTransaction(id, batch, rit),
      physicalCondition: 'DRY',
      contamination: 'CLN',
      disposition: 'ACCEPT',
      createdAt: new Date('2026-09-04T10:00:00.000Z'),
      createdBy: employeeId('11111'),
    }),
  )
}

const correctedAt = new Date('2026-09-08T02:14:00.000Z')
const correctedBy = employeeId('12345')

function baseEditParams(record: ProductionRecord) {
  return {
    correctionId: correctionId('CORR-1'),
    frontId: record.effective.frontId,
    fleetId: record.effective.fleetId,
    truckId: record.effective.truckId,
    truckValidation: record.effective.truckValidation,
    physicalCondition: record.effective.physicalCondition ?? 'DRY',
    contamination: record.effective.contamination ?? 'CLN',
    disposition: record.effective.disposition,
    remark: record.effective.remark,
    reason: 'Salah input truck',
    positionOccupiedByOther: false,
    correctedAt,
    correctedBy,
  } as const
}

describe('applyEditFields', () => {
  it('changes only the effective fields, never the original transaction', () => {
    const record = buildRecord()
    const result = applyEditFields(record, {
      ...baseEditParams(record),
      truckId: truckId('T2'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.truckId).toBe('T2')
    expect(result.value.transaction).toBe(record.transaction)
    expect(result.value.transaction.truckId).toBe('T1')
  })

  it('requires a non-blank reason', () => {
    const record = buildRecord()
    const result = applyEditFields(record, { ...baseEditParams(record), reason: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REASON_REQUIRED')
  })

  it('sets updatedBy/updatedAt and appends exactly one correction', () => {
    const record = buildRecord()
    const result = applyEditFields(record, baseEditParams(record))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.audit.updatedAt).toEqual(correctedAt)
    expect(result.value.audit.updatedBy).toBe('12345')
    expect(result.value.audit.corrections).toHaveLength(1)
    expect(result.value.audit.corrections[0]!.type).toBe('EDIT_FIELDS')
    expect(result.value.audit.corrections[0]!.reason).toBe('Salah input truck')
  })

  it('preserves previous corrections when applied again', () => {
    const record = buildRecord()
    const first = applyEditFields(record, baseEditParams(record))
    if (!first.ok) throw new Error('setup failed')
    const second = applyEditFields(first.value, {
      ...baseEditParams(first.value),
      correctionId: correctionId('CORR-2'),
      reason: 'Kondisi salah',
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.audit.corrections).toHaveLength(2)
    expect(second.value.audit.corrections[0]!.id).toBe('CORR-1')
    expect(second.value.audit.corrections[1]!.id).toBe('CORR-2')
  })

  it('normalizes a blank remark to null', () => {
    const record = buildRecord()
    const result = applyEditFields(record, { ...baseEditParams(record), remark: '   ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.remark).toBeNull()
  })

  it('blocks REJECT -> ACCEPT when another ACCEPT + ACTIVE record already occupies the position', () => {
    const rejectRecord = must(
      createProductionRecord({
        transaction: buildTransaction('TX-1', 1, 1),
        physicalCondition: 'DRY',
        contamination: 'CLN',
        disposition: 'REJECT',
        createdAt: new Date(),
        createdBy: employeeId('11111'),
      }),
    )
    const result = applyEditFields(rejectRecord, {
      ...baseEditParams(rejectRecord),
      disposition: 'ACCEPT',
      positionOccupiedByOther: true,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_POSITION_OCCUPIED')
  })

  it('allows REJECT -> ACCEPT when the position is empty', () => {
    const rejectRecord = must(
      createProductionRecord({
        transaction: buildTransaction('TX-1', 1, 1),
        physicalCondition: 'DRY',
        contamination: 'CLN',
        disposition: 'REJECT',
        createdAt: new Date(),
        createdBy: employeeId('11111'),
      }),
    )
    const result = applyEditFields(rejectRecord, {
      ...baseEditParams(rejectRecord),
      disposition: 'ACCEPT',
      positionOccupiedByOther: false,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.disposition).toBe('ACCEPT')
  })

  it('ACCEPT -> REJECT is always allowed, vacating the position', () => {
    const record = buildRecord()
    const result = applyEditFields(record, { ...baseEditParams(record), disposition: 'REJECT', positionOccupiedByOther: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.disposition).toBe('REJECT')
  })

  it('rejects an already-VOIDED record', () => {
    const record = buildRecord()
    const voided = applyVoidRecord(record, {
      correctionId: correctionId('CORR-VOID'),
      reason: 'test void',
      correctedAt,
      correctedBy,
    })
    if (!voided.ok) throw new Error('setup failed')
    const result = applyEditFields(voided.value, baseEditParams(voided.value))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORD_VOIDED')
  })
})

describe('applySwitchPosition', () => {
  it('moves the effective batchPosition, leaving the original transaction position unchanged', () => {
    const record = buildRecord('TX-1', 5, 1)
    const result = applySwitchPosition(record, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: 'Salah posisi ritase',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(result.value.effective.batchPosition.ritNumber)).toBe(9)
    expect(Number(result.value.transaction.batchPosition.batchNumber)).toBe(5)
    expect(Number(result.value.transaction.batchPosition.ritNumber)).toBe(1)
  })

  it('never changes the Transaction_ID', () => {
    const record = buildRecord('TX-1', 5, 1)
    const result = applySwitchPosition(record, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction.id).toBe('TX-1')
  })

  it('appends a SWITCH_POSITION correction with before/after snapshots', () => {
    const record = buildRecord('TX-1', 5, 1)
    const result = applySwitchPosition(record, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const correction = result.value.audit.corrections[0]!
    expect(correction.type).toBe('SWITCH_POSITION')
    expect(Number(correction.before.batchPosition.batchNumber)).toBe(5)
    expect(Number(correction.after.batchPosition.batchNumber)).toBe(4)
  })

  it('rejects switching a REJECT record', () => {
    const record = must(
      createProductionRecord({
        transaction: buildTransaction('TX-1', 5, 1),
        physicalCondition: 'DRY',
        contamination: 'CLN',
        disposition: 'REJECT',
        createdAt: new Date(),
        createdBy: employeeId('11111'),
      }),
    )
    const result = applySwitchPosition(record, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORD_NOT_SWITCHABLE')
  })

  it('rejects switching a VOIDED record', () => {
    const record = buildRecord('TX-1', 5, 1)
    const voided = applyVoidRecord(record, {
      correctionId: correctionId('CORR-VOID'),
      reason: 'void reason',
      correctedAt,
      correctedBy,
    })
    if (!voided.ok) throw new Error('setup failed')
    const result = applySwitchPosition(voided.value, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORD_NOT_SWITCHABLE')
  })

  it('requires a non-blank reason', () => {
    const record = buildRecord('TX-1', 5, 1)
    const result = applySwitchPosition(record, {
      correctionId: correctionId('CORR-1'),
      targetPosition: position(4, 9),
      reason: '  ',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REASON_REQUIRED')
  })
})

describe('applyVoidRecord', () => {
  it('sets status ACTIVE -> VOIDED and retains the original transaction', () => {
    const record = buildRecord()
    const result = applyVoidRecord(record, {
      correctionId: correctionId('CORR-1'),
      reason: 'Salah catat',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.status).toBe('VOIDED')
    expect(result.value.transaction).toBe(record.transaction)
  })

  it('appends a VOID_RECORD correction', () => {
    const record = buildRecord()
    const result = applyVoidRecord(record, {
      correctionId: correctionId('CORR-1'),
      reason: 'Salah catat',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.audit.corrections).toHaveLength(1)
    expect(result.value.audit.corrections[0]!.type).toBe('VOID_RECORD')
  })

  it('rejects voiding an already-VOIDED record', () => {
    const record = buildRecord()
    const first = applyVoidRecord(record, {
      correctionId: correctionId('CORR-1'),
      reason: 'Salah catat',
      correctedAt,
      correctedBy,
    })
    if (!first.ok) throw new Error('setup failed')
    const second = applyVoidRecord(first.value, {
      correctionId: correctionId('CORR-2'),
      reason: 'again',
      correctedAt,
      correctedBy,
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('ALREADY_VOIDED')
  })

  it('requires a non-blank reason', () => {
    const record = buildRecord()
    const result = applyVoidRecord(record, {
      correctionId: correctionId('CORR-1'),
      reason: '',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REASON_REQUIRED')
  })
})
