import { describe, expect, it } from 'vitest'
import {
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_EMPLOYEE_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { recordSamplePosition } from './create-sample-position'

const masterData = buildFixtureMasterData()
const pile = buildFixtureSapPile('PILE-1')
const shift = buildFixtureShift('SHIFT-1')

describe('recordSamplePosition', () => {
  it('builds a valid NOT_PICKED_UP SamplePosition from raw UI input', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-1',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: { status: 'NOT_PICKED_UP' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('SP-1')
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([2, 4, 6, 8, 10])
    expect(Number(result.value.totalBag)).toBe(5)
    expect(result.value.delivery).toEqual({ status: 'NOT_PICKED_UP' })
  })

  it('builds a valid DELIVERED SamplePosition with a destination and known dispatcher', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-2',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: { status: 'DELIVERED', destination: 'LAB-A', dispatcherEmployeeId: FIXTURE_EMPLOYEE_ID },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.delivery).toEqual({
      status: 'DELIVERED',
      destination: 'LAB-A',
      dispatcherEmployeeId: FIXTURE_EMPLOYEE_ID,
    })
  })

  it('builds a valid DELIVERED SamplePosition without a dispatcher', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-3',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: { status: 'DELIVERED', destination: 'LAB-A' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.delivery).toEqual({ status: 'DELIVERED', destination: 'LAB-A' })
  })

  it('rejects a DELIVERED draft with a blank destination', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-4',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: { status: 'DELIVERED', destination: '' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_DELIVERY_DESTINATION_CODE')
  })

  it('rejects a DELIVERED draft with an unknown dispatcher EmployeeId', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-5',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 10,
      masterData,
      delivery: { status: 'DELIVERED', destination: 'LAB-A', dispatcherEmployeeId: '99999' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DISPATCHER_NOT_FOUND')
  })

  it('propagates a domain range error (e.g. reversed range) unchanged', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-6',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 10,
      ritTo: 2,
      masterData,
      delivery: { status: 'NOT_PICKED_UP' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_REVERSED')
  })

  it('never accepts a caller-supplied Total Bag or sampledRitNumbers (no such params exist)', () => {
    const result = recordSamplePosition({
      generatedSamplePositionId: 'SP-7',
      shift,
      pile,
      batchNumber: 24,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: { status: 'NOT_PICKED_UP' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.totalBag)).toBe(1)
  })
})
