/**
 * Presentation projection for a Sample Setup row. The registered physical
 * in-house count is authoritative when it exists; delivery positions remain
 * the fallback for older registrations that pre-date that field.
 */
export type SampleDisplayStatus = 'NEW_SAMPLE' | 'NOT_PICKED_UP' | 'DISPATCHED'

export interface SampleDisplayProgress {
  readonly numerator: number
  readonly denominator: number
  readonly inHouseBags: number
  readonly dispatchedBags: number
  readonly status: SampleDisplayStatus
}

export function deriveSampleDisplayProgress({
  producedBags,
  deliveredBags,
  recordedInHouseBags,
}: Readonly<{
  producedBags: number
  deliveredBags: number
  recordedInHouseBags?: number
}>): SampleDisplayProgress {
  const denominator = Math.max(0, producedBags)
  if (denominator === 0) {
    return {
      numerator: 0,
      denominator: 0,
      inHouseBags: 0,
      dispatchedBags: 0,
      status: 'NEW_SAMPLE',
    }
  }

  const provenDispatchedBags = Math.max(0, Math.min(denominator, deliveredBags))
  // A stored zero in-house value is not delivery evidence. Until every bag has
  // a matching dispatched position, retain the remaining quantity as in house.
  const recordedInHouse = recordedInHouseBags === undefined
    ? undefined
    : Math.max(0, Math.min(denominator, recordedInHouseBags))
  const inHouseBags = recordedInHouse !== undefined
    ? recordedInHouse
    : Math.max(0, denominator - provenDispatchedBags)

  const dispatchedBags = recordedInHouse !== undefined
    ? Math.max(0, denominator - inHouseBags)
    : provenDispatchedBags

  if (inHouseBags === 0 && dispatchedBags === denominator) {
    return { numerator: dispatchedBags, denominator, inHouseBags, dispatchedBags, status: 'DISPATCHED' }
  }
  return { numerator: inHouseBags, denominator, inHouseBags, dispatchedBags, status: 'NOT_PICKED_UP' }
}

export function formatSampleBagCount(value: number): string {
  const normalized = Math.round(Math.max(0, value) * 1_000) / 1_000
  return Number.isInteger(normalized) && normalized < 10
    ? String(normalized).padStart(2, '0')
    : String(normalized)
}
