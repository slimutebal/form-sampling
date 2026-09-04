import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '../batch/batch-number'
import { parseRitNumber } from '../batch/rit-number'
import { parseOreCode } from '../common/codes'
import { parseEmployeeId, parsePileId, parseSamplePositionId, parseShiftId } from '../common/identifiers'
import type { Result } from '../common/result'
import { createMasterData, type MasterData } from '../master/master-data'
import { createEmployeeReference } from '../master/references'
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
} from '../master/sampling-config'
import { createPile, type Pile } from '../pile/pile'
import { parseDeliveryDestinationCode } from './delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery } from './delivery-status'
import { createSamplePosition } from './sample-position'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${result.error.code}`)
  return result.value
}

function buildMasterData(): MasterData {
  const sap = must(parseOreCode('SAP'))
  const lim = must(parseOreCode('LIM'))
  const employeeId = must(parseEmployeeId('12345'))
  return must(
    createMasterData({
      employees: [createEmployeeReference(employeeId, 'John Doe')],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
        createOreSamplingConfig({
          oreCode: lim,
          interval: must(parseSamplingInterval(5)),
          batchSize: must(parseBatchSize(100)),
          packing: must(parsePackingConfigValue(10)),
        }),
      ],
    }),
  )
}

function sapPile(id: string): Pile {
  return createPile(must(parsePileId(id)), must(parseOreCode('SAP')))
}

function limPile(id: string): Pile {
  return createPile(must(parsePileId(id)), must(parseOreCode('LIM')))
}

const masterData = buildMasterData()

describe('createSamplePosition', () => {
  it('builds a valid SAP position with generated sample range and Total Bag', () => {
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-1')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(24)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(10)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.oreCode).toBe('SAP')
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([2, 4, 6, 8, 10])
    expect(Number(result.value.totalBag)).toBe(5)
    expect(result.value.delivery).toEqual({ status: 'NOT_PICKED_UP' })
  })

  it('L. derives Ore from the Pile — never accepted as caller input (no oreCode param exists)', () => {
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-2')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: limPile('PILE-LIM'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(5)),
      ritTo: must(parseRitNumber(5)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.oreCode).toBe('LIM')
  })

  it('M. NOT_PICKED_UP is valid without a destination or dispatcher', () => {
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-3')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(true)
  })

  it('N. DELIVERED requires a destination (enforced by SampleDelivery construction)', () => {
    const destination = must(parseDeliveryDestinationCode('LAB-A'))
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-4')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createDeliveredDelivery(destination),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.delivery).toEqual({ status: 'DELIVERED', destination: 'LAB-A' })
  })

  it('O. DELIVERED with a known Dispatcher EmployeeId is valid', () => {
    const destination = must(parseDeliveryDestinationCode('LAB-A'))
    const dispatcherEmployeeId = must(parseEmployeeId('12345'))
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-5')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createDeliveredDelivery(destination, dispatcherEmployeeId),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.delivery).toEqual({
      status: 'DELIVERED',
      destination: 'LAB-A',
      dispatcherEmployeeId: '12345',
    })
  })

  it('P. DELIVERED with an unknown Dispatcher EmployeeId is rejected', () => {
    const destination = must(parseDeliveryDestinationCode('LAB-A'))
    const unknownDispatcher = must(parseEmployeeId('99999'))
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-6')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createDeliveredDelivery(destination, unknownDispatcher),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DISPATCHER_NOT_FOUND')
  })

  it('Q. Total Bag is the calculated snapshot, not a caller-suppliable field', () => {
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-7')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: limPile('PILE-LIM'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(5)),
      ritTo: must(parseRitNumber(50)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sampledRitNumbers).toHaveLength(10)
    expect(Number(result.value.totalBag)).toBe(5)
    expect(result.value).not.toHaveProperty('totalBagInput')
  })

  it('propagates ORE_SAMPLING_CONFIG_NOT_FOUND for a Pile whose Ore has no configuration', () => {
    const unconfiguredOrePile = createPile(must(parsePileId('PILE-X')), must(parseOreCode('UNKNOWN_ORE')))
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-8')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: unconfiguredOrePile,
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(2)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })

  it('propagates a sample-range error (e.g. reversed range) unchanged', () => {
    const result = createSamplePosition({
      id: must(parseSamplePositionId('SP-9')),
      shiftId: must(parseShiftId('SHIFT-1')),
      pile: sapPile('PILE-1'),
      batchNumber: must(parseBatchNumber(1)),
      ritFrom: must(parseRitNumber(10)),
      ritTo: must(parseRitNumber(2)),
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_REVERSED')
  })
})
