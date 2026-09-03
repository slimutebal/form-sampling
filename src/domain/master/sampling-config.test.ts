import { describe, expect, it } from 'vitest'
import { parseOreCode } from '../common/codes'
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
} from './sampling-config'

describe('parseSamplingInterval', () => {
  it.each([1, 2, 5])('accepts positive integer %d', (value) => {
    expect(parseSamplingInterval(value).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(parseSamplingInterval(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(parseSamplingInterval(-1).ok).toBe(false)
  })

  it('rejects decimal values', () => {
    expect(parseSamplingInterval(2.5).ok).toBe(false)
  })

  it('rejects NaN', () => {
    expect(parseSamplingInterval(Number.NaN).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(parseSamplingInterval(Number.POSITIVE_INFINITY).ok).toBe(false)
  })
})

describe('parseBatchSize', () => {
  it.each([20, 100])('accepts positive integer %d', (value) => {
    expect(parseBatchSize(value).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(parseBatchSize(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(parseBatchSize(-5).ok).toBe(false)
  })

  it('rejects decimal values', () => {
    expect(parseBatchSize(20.5).ok).toBe(false)
  })

  it('rejects NaN', () => {
    expect(parseBatchSize(Number.NaN).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(parseBatchSize(Number.POSITIVE_INFINITY).ok).toBe(false)
  })
})

describe('parsePackingConfigValue', () => {
  it.each([2, 10])('accepts positive integer %d', (value) => {
    expect(parsePackingConfigValue(value).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(parsePackingConfigValue(0).ok).toBe(false)
  })

  it('rejects negative values', () => {
    expect(parsePackingConfigValue(-2).ok).toBe(false)
  })

  it('rejects decimal values', () => {
    expect(parsePackingConfigValue(2.5).ok).toBe(false)
  })

  it('rejects NaN', () => {
    expect(parsePackingConfigValue(Number.NaN).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(parsePackingConfigValue(Number.POSITIVE_INFINITY).ok).toBe(false)
  })
})

function oreConfig(oreCodeValue: string, interval: number, batchSize: number, packing: number) {
  const oreCode = parseOreCode(oreCodeValue)
  const parsedInterval = parseSamplingInterval(interval)
  const parsedBatchSize = parseBatchSize(batchSize)
  const parsedPacking = parsePackingConfigValue(packing)
  if (!oreCode.ok || !parsedInterval.ok || !parsedBatchSize.ok || !parsedPacking.ok) {
    throw new Error('invalid test fixture')
  }
  return createOreSamplingConfig({
    oreCode: oreCode.value,
    interval: parsedInterval.value,
    batchSize: parsedBatchSize.value,
    packing: parsedPacking.value,
  })
}

describe('OreSamplingConfig', () => {
  it('preserves the current SAP configuration exactly (BR-MASTER-002)', () => {
    const config = oreConfig('SAP', 2, 20, 2)
    expect(Number(config.interval)).toBe(2)
    expect(Number(config.batchSize)).toBe(20)
    expect(Number(config.packing)).toBe(2)
  })

  it('preserves the current LIM configuration exactly (BR-MASTER-002)', () => {
    const config = oreConfig('LIM', 5, 100, 10)
    expect(Number(config.interval)).toBe(5)
    expect(Number(config.batchSize)).toBe(100)
    expect(Number(config.packing)).toBe(10)
  })

  it('supports a future/unknown ore code without a closed enum', () => {
    const config = oreConfig('FUTURE_ORE', 3, 30, 3)
    expect(config.oreCode).toBe('FUTURE_ORE')
    expect(Number(config.interval)).toBe(3)
    expect(Number(config.batchSize)).toBe(30)
    expect(Number(config.packing)).toBe(3)
  })
})
