import { describe, expect, it } from 'vitest'
import { parseFleetId, parseFrontId, parseTruckId } from '../common/identifiers'
import type { TruckId } from '../common/identifiers'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from './fleet-definition'

function truckId(value: string): TruckId {
  const parsed = parseTruckId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function fleetId(value: string) {
  const parsed = parseFleetId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

function frontId(value: string) {
  const parsed = parseFrontId(value)
  if (!parsed.ok) throw new Error('invalid test fixture')
  return parsed.value
}

describe('createBaseFleetDefinition', () => {
  it('builds a BASE fleet from a non-duplicate truck list', () => {
    const result = createBaseFleetDefinition({
      fleetId: fleetId('FLEET-A'),
      frontId: frontId('F1'),
      truckIds: [truckId('T1'), truckId('T2'), truckId('T3')],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('BASE')
    expect(result.value.truckIds).toEqual(['T1', 'T2', 'T3'])
  })

  it('rejects a duplicate TruckId within truckIds', () => {
    const result = createBaseFleetDefinition({
      fleetId: fleetId('FLEET-A'),
      frontId: frontId('F1'),
      truckIds: [truckId('T1'), truckId('T1')],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
  })

  it('supports more than 15 trucks — no legacy Truck1..Truck15 limit', () => {
    const truckIds = Array.from({ length: 20 }, (_, index) => truckId(`T${index + 1}`))
    const result = createBaseFleetDefinition({ fleetId: fleetId('FLEET-BIG'), frontId: frontId('F1'), truckIds })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckIds).toHaveLength(20)
  })

  it('does not alias the caller-owned truckIds array', () => {
    const truckIds = [truckId('T1'), truckId('T2')]
    const result = createBaseFleetDefinition({ fleetId: fleetId('FLEET-A'), frontId: frontId('F1'), truckIds })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    truckIds.push(truckId('T3'))

    expect(result.value.truckIds).toEqual(['T1', 'T2'])
  })
})

describe('createDerivedFleetDefinition', () => {
  function baseParams() {
    return {
      fleetId: fleetId('FLEET-B'),
      frontId: frontId('F1'),
      referenceFleetId: fleetId('FLEET-A'),
    }
  }

  it('builds a DERIVED fleet with explicit add/remove lists', () => {
    const result = createDerivedFleetDefinition({
      ...baseParams(),
      addedTruckIds: [truckId('T4')],
      removedTruckIds: [truckId('T2')],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('DERIVED')
    expect(result.value.referenceFleetId).toBe('FLEET-A')
    expect(result.value.addedTruckIds).toEqual(['T4'])
    expect(result.value.removedTruckIds).toEqual(['T2'])
  })

  it('rejects a duplicate TruckId within addedTruckIds', () => {
    const result = createDerivedFleetDefinition({
      ...baseParams(),
      addedTruckIds: [truckId('T4'), truckId('T4')],
      removedTruckIds: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
  })

  it('rejects a duplicate TruckId within removedTruckIds', () => {
    const result = createDerivedFleetDefinition({
      ...baseParams(),
      addedTruckIds: [],
      removedTruckIds: [truckId('T2'), truckId('T2')],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_FLEET_TRUCK')
  })

  it('rejects the same TruckId appearing in both addedTruckIds and removedTruckIds', () => {
    const result = createDerivedFleetDefinition({
      ...baseParams(),
      addedTruckIds: [truckId('T2')],
      removedTruckIds: [truckId('T2')],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CONTRADICTORY_FLEET_DELTA')
  })

  it('does not alias the caller-owned add/remove arrays', () => {
    const addedTruckIds = [truckId('T4')]
    const removedTruckIds = [truckId('T2')]
    const result = createDerivedFleetDefinition({ ...baseParams(), addedTruckIds, removedTruckIds })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    addedTruckIds.push(truckId('T5'))
    removedTruckIds.push(truckId('T3'))

    expect(result.value.addedTruckIds).toEqual(['T4'])
    expect(result.value.removedTruckIds).toEqual(['T2'])
  })
})
