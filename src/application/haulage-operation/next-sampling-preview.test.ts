import { describe, expect, it } from 'vitest'
import { previewNextSampling } from './next-sampling-preview'
import {
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureSapPile,
  fixturePosition,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()

describe('previewNextSampling', () => {
  it('H. SAP interval 2: Rit 12 is a sample point, increment 6', () => {
    const result = previewNextSampling(buildFixtureSapPile('PILE-1'), masterData, fixturePosition(24, 12))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation).toEqual({ sampleRequired: true, incrementNumber: 6 })
    expect(Number(result.value.batchSize)).toBe(20)
  })

  it('I. LIM interval 5: Rit 65 is a sample point, increment 13', () => {
    const result = previewNextSampling(buildFixtureLimPile('PILE-2'), masterData, fixturePosition(7, 65))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation).toEqual({ sampleRequired: true, incrementNumber: 13 })
    expect(Number(result.value.batchSize)).toBe(100)
  })

  it('J. SAP Rit 11 is not a sample point', () => {
    const result = previewNextSampling(buildFixtureSapPile('PILE-1'), masterData, fixturePosition(24, 11))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.samplingEvaluation).toEqual({ sampleRequired: false })
  })

  it('rejects a position whose Rit exceeds the configured BatchSize', () => {
    const result = previewNextSampling(buildFixtureSapPile('PILE-1'), masterData, fixturePosition(24, 21))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RIT_EXCEEDS_BATCH_SIZE')
  })
})
