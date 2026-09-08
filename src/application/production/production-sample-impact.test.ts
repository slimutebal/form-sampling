import { describe, expect, it } from 'vitest'
import {
  deriveEffectiveSamplingRequirement,
  deriveSampleImpact,
} from '@/application/production/production-sample-impact'
import { buildFixtureMasterData, buildFixtureSapPile, fixturePosition } from '@/test/fixtures/haulage-operation-test-fixtures'

// SAP fixture config: interval 2 — every even Rit is a sample point.
const masterData = buildFixtureMasterData()
const pile = buildFixtureSapPile('PILE-1')

function requirement(batch: number, rit: number) {
  const result = deriveEffectiveSamplingRequirement(pile, masterData, fixturePosition(batch, rit))
  if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`)
  return result.value
}

describe('deriveEffectiveSamplingRequirement', () => {
  it('derives sampleRequired from the current Ore SamplingInterval, not any transaction snapshot', () => {
    expect(requirement(4, 4).sampleRequired).toBe(true)
    expect(requirement(4, 5).sampleRequired).toBe(false)
  })

  it('includes the increment number only when sampleRequired', () => {
    expect(requirement(4, 4).incrementNumber).toBe(2)
    expect(requirement(4, 5).incrementNumber).toBeUndefined()
  })
})

describe('deriveSampleImpact', () => {
  it('reports no impact when SAMPLE stays SAMPLE', () => {
    const impact = deriveSampleImpact(requirement(4, 4), requirement(7, 4))
    expect(impact.changed).toBe(false)
  })

  it('reports no impact when NO SAMPLE stays NO SAMPLE', () => {
    const impact = deriveSampleImpact(requirement(4, 5), requirement(7, 7))
    expect(impact.changed).toBe(false)
  })

  it('reports impact when SAMPLE becomes NO SAMPLE', () => {
    const impact = deriveSampleImpact(requirement(4, 4), requirement(7, 5))
    expect(impact.changed).toBe(true)
    expect(impact.before.sampleRequired).toBe(true)
    expect(impact.after.sampleRequired).toBe(false)
  })

  it('reports impact when NO SAMPLE becomes SAMPLE', () => {
    const impact = deriveSampleImpact(requirement(4, 5), requirement(7, 4))
    expect(impact.changed).toBe(true)
    expect(impact.before.sampleRequired).toBe(false)
    expect(impact.after.sampleRequired).toBe(true)
  })
})
