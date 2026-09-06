import { describe, expect, it } from 'vitest'
import { recordHaulage } from './create-haulage-record'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
  FIXTURE_FLEET_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  fixturePosition,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')
const shift = buildFixtureShift('SHIFT-1')

describe('recordHaulage', () => {
  it('N. creates a validated HaulageTransaction with correct shift/pile/position/front/fleet/truck/sampling/VALID classification', () => {
    const result = recordHaulage({
      generatedTransactionId: 'TX-1',
      shift,
      pile,
      nextPosition: fixturePosition(24, 12),
      selectedFleetId: FIXTURE_FLEET_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      masterData,
      fleetSetup,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftId).toBe(shift.id)
    expect(result.value.pileId).toBe(pile.id)
    expect(result.value.batchPosition).toEqual(fixturePosition(24, 12))
    expect(result.value.fleetId).toBe(FIXTURE_FLEET_ID)
    expect(result.value.truckId).toBe(FIXTURE_IN_FLEET_TRUCK_ID)
    expect(result.value.frontId).toBeTruthy()
    expect(result.value.samplingEvaluation).toEqual({ sampleRequired: true, incrementNumber: 6 })
    expect(result.value.truckValidation.status).toBe('VALID')
  })

  it('O. preserves the injected transaction id exactly', () => {
    const result = recordHaulage({
      generatedTransactionId: 'FIXED-TX-ID-42',
      shift,
      pile,
      nextPosition: fixturePosition(24, 1),
      selectedFleetId: FIXTURE_FLEET_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      masterData,
      fleetSetup,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('FIXED-TX-ID-42')
  })

  it('P. an invalid (blank) generated id fails with a stable error', () => {
    const result = recordHaulage({
      generatedTransactionId: '   ',
      shift,
      pile,
      nextPosition: fixturePosition(24, 1),
      selectedFleetId: FIXTURE_FLEET_ID,
      selectedTruckId: FIXTURE_IN_FLEET_TRUCK_ID,
      masterData,
      fleetSetup,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_HAULAGE_TRANSACTION_ID')
  })

  it('Q. records a WRONG_TRUCK classification instead of blocking it (Phase 18 §6, BR-TRUCK-003 — Wrong Truck is a recordable exception, not a rejected submission)', () => {
    const result = recordHaulage({
      generatedTransactionId: 'TX-STALE',
      shift,
      pile,
      nextPosition: fixturePosition(24, 1),
      selectedFleetId: FIXTURE_FLEET_ID,
      // A truck that exists in master data but is outside this fleet's
      // effective membership — the Truck checker allows selecting it, and
      // the resulting transaction must still be recordable.
      selectedTruckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
      masterData,
      fleetSetup,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.truckValidation.status).toBe('WRONG_TRUCK')
  })
})
