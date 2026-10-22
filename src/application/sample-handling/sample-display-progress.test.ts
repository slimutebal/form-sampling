import { describe, expect, it } from 'vitest'
import { deriveSampleDisplayProgress, formatSampleBagCount } from './sample-display-progress'

describe('deriveSampleDisplayProgress', () => {
  it('uses the recorded in-house bags as the Not Picked Up numerator', () => {
    expect(deriveSampleDisplayProgress({ producedBags: 6, deliveredBags: 0, recordedInHouseBags: 6 }))
      .toEqual({ numerator: 6, denominator: 6, inHouseBags: 6, dispatchedBags: 0, status: 'NOT_PICKED_UP' })
    expect(formatSampleBagCount(6)).toBe('06')
  })

  it('uses one Not Picked Up state for a mixed physical bag state', () => {
    expect(deriveSampleDisplayProgress({ producedBags: 6, deliveredBags: 0, recordedInHouseBags: 3 }))
      .toEqual({ numerator: 3, denominator: 6, inHouseBags: 3, dispatchedBags: 3, status: 'NOT_PICKED_UP' })
  })

  it('uses dispatched bags as the numerator once no bags remain in house', () => {
    expect(deriveSampleDisplayProgress({ producedBags: 6, deliveredBags: 6, recordedInHouseBags: 0 }))
      .toEqual({ numerator: 6, denominator: 6, inHouseBags: 0, dispatchedBags: 6, status: 'DISPATCHED' })
  })

  it('treats zero in-house as dispatched for sample display', () => {
  expect(deriveSampleDisplayProgress({
    producedBags: 6,
    deliveredBags: 0,
    recordedInHouseBags: 0,
  })).toEqual({
    numerator: 6,
    denominator: 6,
    inHouseBags: 0,
    dispatchedBags: 6,
    status: 'DISPATCHED',
  })
  })

  it('preserves fractional bag quantities and the empty New Sample state', () => {
    expect(deriveSampleDisplayProgress({ producedBags: 1.5, deliveredBags: 0.5 }))
      .toEqual({ numerator: 1, denominator: 1.5, inHouseBags: 1, dispatchedBags: 0.5, status: 'NOT_PICKED_UP' })
    expect(formatSampleBagCount(0.5)).toBe('0.5')
    expect(deriveSampleDisplayProgress({ producedBags: 0, deliveredBags: 0 })).toMatchObject({
      numerator: 0,
      denominator: 0,
      status: 'NEW_SAMPLE',
    })
  })
})
