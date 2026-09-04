import { describe, expect, it } from 'vitest'
import { createFleetSetup } from '@/domain/fleet/fleet-setup'
import { isFrontTruckSelectionCurrent, operationalFleetOptions } from './operational-fleet-options'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  FIXTURE_FLEET_ID,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'

describe('operationalFleetOptions', () => {
  it('M. resolves one option per Fleet using the Phase 5 effective-fleet resolver, labeled by FrontId', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = operationalFleetOptions(masterData, fleetSetup)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(1)
    expect(result.value[0]).toMatchObject({
      fleetId: FIXTURE_FLEET_ID,
      frontId: FIXTURE_FRONT_ID,
      effectiveTruckIds: [FIXTURE_IN_FLEET_TRUCK_ID],
    })
  })

  it('returns an empty option list for an empty fleet setup', () => {
    const masterData = buildFixtureMasterData()
    const emptyFleetSetup = createFleetSetup({ fronts: [], fleets: [] }, masterData)
    expect(emptyFleetSetup.ok).toBe(true)
    if (!emptyFleetSetup.ok) return

    const result = operationalFleetOptions(masterData, emptyFleetSetup.value)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })
})

describe('isFrontTruckSelectionCurrent', () => {
  const masterData = buildFixtureMasterData()
  const fleetSetup = buildFixtureFleetSetup(masterData)
  const resolved = operationalFleetOptions(masterData, fleetSetup)
  if (!resolved.ok) throw new Error('invalid test fixture')
  const frontOptions = resolved.value

  it('is true for a Fleet/Truck pair that is still current', () => {
    expect(isFrontTruckSelectionCurrent(frontOptions, FIXTURE_FLEET_ID, FIXTURE_IN_FLEET_TRUCK_ID)).toBe(true)
  })

  it('is false when the selected Fleet no longer exists in frontOptions', () => {
    expect(isFrontTruckSelectionCurrent(frontOptions, 'STALE-FLEET', FIXTURE_IN_FLEET_TRUCK_ID)).toBe(false)
  })

  it('is false when the selected Truck is no longer that Fleet\'s effective member', () => {
    expect(isFrontTruckSelectionCurrent(frontOptions, FIXTURE_FLEET_ID, 'T-STALE')).toBe(false)
  })

  it('is false when either selection is blank', () => {
    expect(isFrontTruckSelectionCurrent(frontOptions, '', FIXTURE_IN_FLEET_TRUCK_ID)).toBe(false)
    expect(isFrontTruckSelectionCurrent(frontOptions, FIXTURE_FLEET_ID, '')).toBe(false)
  })
})
