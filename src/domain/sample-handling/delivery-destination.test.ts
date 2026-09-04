import { describe, expect, it } from 'vitest'
import { parseDeliveryDestinationCode } from './delivery-destination'

describe('DeliveryDestinationCode', () => {
  it('accepts a non-blank value', () => {
    const result = parseDeliveryDestinationCode('LAB-A')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('LAB-A')
  })

  it('rejects a blank value', () => {
    expect(parseDeliveryDestinationCode('').ok).toBe(false)
  })

  it('rejects a whitespace-only value', () => {
    expect(parseDeliveryDestinationCode('   ').ok).toBe(false)
  })
})
