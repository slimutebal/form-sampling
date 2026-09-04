import { describe, expect, it } from 'vitest'
import { parseEmployeeId } from '../common/identifiers'
import { parseDeliveryDestinationCode } from './delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery } from './delivery-status'

describe('SampleDelivery', () => {
  it('NOT_PICKED_UP carries no destination or dispatcher', () => {
    const delivery = createNotPickedUpDelivery()
    expect(delivery).toEqual({ status: 'NOT_PICKED_UP' })
    expect(delivery).not.toHaveProperty('destination')
    expect(delivery).not.toHaveProperty('dispatcherEmployeeId')
  })

  it('DELIVERED without a dispatcher carries only the destination', () => {
    const destination = parseDeliveryDestinationCode('LAB-A')
    expect(destination.ok).toBe(true)
    if (!destination.ok) return

    const delivery = createDeliveredDelivery(destination.value)
    expect(delivery.status).toBe('DELIVERED')
    if (delivery.status !== 'DELIVERED') return
    expect(delivery.destination).toBe('LAB-A')
    expect(delivery).not.toHaveProperty('dispatcherEmployeeId')
  })

  it('DELIVERED with a dispatcher carries both destination and dispatcher', () => {
    const destination = parseDeliveryDestinationCode('LAB-A')
    const dispatcherEmployeeId = parseEmployeeId('12345')
    expect(destination.ok && dispatcherEmployeeId.ok).toBe(true)
    if (!destination.ok || !dispatcherEmployeeId.ok) return

    const delivery = createDeliveredDelivery(destination.value, dispatcherEmployeeId.value)
    expect(delivery.status).toBe('DELIVERED')
    if (delivery.status !== 'DELIVERED') return
    expect(delivery.destination).toBe('LAB-A')
    expect(delivery.dispatcherEmployeeId).toBe('12345')
  })
})
