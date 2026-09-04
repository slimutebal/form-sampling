import { describe, expect, it } from 'vitest'
import { parseRitNumber } from '../batch/rit-number'
import { parseBatchSize, parseSamplingInterval } from '../master/sampling-config'
import { buildSampleRange } from './sample-range'

function rit(value: number) {
  const result = parseRitNumber(value)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

const SAP_INTERVAL = (() => {
  const result = parseSamplingInterval(2)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
})()
const SAP_BATCH_SIZE = (() => {
  const result = parseBatchSize(20)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
})()
const LIM_INTERVAL = (() => {
  const result = parseSamplingInterval(5)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
})()
const LIM_BATCH_SIZE = (() => {
  const result = parseBatchSize(100)
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
})()

describe('buildSampleRange', () => {
  it('A. SAP range 2->10 generates 2,4,6,8,10', () => {
    const result = buildSampleRange({
      ritFrom: rit(2),
      ritTo: rit(10),
      interval: SAP_INTERVAL,
      batchSize: SAP_BATCH_SIZE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([2, 4, 6, 8, 10])
  })

  it('B. SAP range 3->10 generates 4,6,8,10 (bounds need not themselves be sample points)', () => {
    const result = buildSampleRange({
      ritFrom: rit(3),
      ritTo: rit(10),
      interval: SAP_INTERVAL,
      batchSize: SAP_BATCH_SIZE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([4, 6, 8, 10])
  })

  it('C. LIM range 5->50 generates every multiple of 5', () => {
    const result = buildSampleRange({
      ritFrom: rit(5),
      ritTo: rit(50),
      interval: LIM_INTERVAL,
      batchSize: LIM_BATCH_SIZE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
  })

  it('D. LIM single-point range 5->5 generates exactly [5]', () => {
    const result = buildSampleRange({
      ritFrom: rit(5),
      ritTo: rit(5),
      interval: LIM_INTERVAL,
      batchSize: LIM_BATCH_SIZE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sampledRitNumbers.map(Number)).toEqual([5])
  })

  it('E. a reversed range (From > To) is rejected', () => {
    const result = buildSampleRange({
      ritFrom: rit(10),
      ritTo: rit(2),
      interval: SAP_INTERVAL,
      batchSize: SAP_BATCH_SIZE,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_REVERSED')
  })

  it('F. a range exceeding the configured batch size is rejected', () => {
    const result = buildSampleRange({
      ritFrom: rit(15),
      ritTo: rit(25),
      interval: SAP_INTERVAL,
      batchSize: SAP_BATCH_SIZE,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_EXCEEDS_BATCH_SIZE')
  })

  it('G. a range with no sample position is rejected', () => {
    const result = buildSampleRange({
      ritFrom: rit(3),
      ritTo: rit(3),
      interval: SAP_INTERVAL,
      batchSize: SAP_BATCH_SIZE,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SAMPLE_RANGE_HAS_NO_SAMPLE_POSITION')
  })

  it('does not mutate its inputs', () => {
    const from = rit(2)
    const to = rit(10)
    buildSampleRange({ ritFrom: from, ritTo: to, interval: SAP_INTERVAL, batchSize: SAP_BATCH_SIZE })
    expect(Number(from)).toBe(2)
    expect(Number(to)).toBe(10)
  })
})
