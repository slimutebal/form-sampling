import { describe, expect, it } from 'vitest'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import { createFrontDefinition, createFrontId } from '@/domain/fleet/front'
import {
  operationalFleetOptionForFront,
  operationalFleetOptions,
  operationalFleetOptionsForPile,
} from './operational-fleet-options'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  fixtureFleetId,
  fixtureFrontId,
  fixturePileId,
  FIXTURE_FLEET_ID,
  FIXTURE_FRONT_ID,
  FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { parseHaulerCode } from '@/domain/master/master-codes'
import type { MasterData } from '@/domain/master/master-data'

function must<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.error)}`)
  return result.value as T
}

/** Two independent BASE fronts on the fixture Sector/Hauler, F1 -> DEST-A and F3 -> DEST-B, plus F1's fleet inherited by a continuation F2. */
function buildScopedFleetSetup(masterData: MasterData): FleetSetup {
  const sectorCode = masterData.sectors[0]!.code
  const hauler = must(parseHaulerCode('H1'))
  const destA = fixturePileId('DEST-A')
  const destB = fixturePileId('DEST-B')

  const front1 = createFrontDefinition(fixtureFrontId('F1'), sectorCode, hauler, destA)
  const front2 = createFrontDefinition(must(createFrontId(sectorCode, 2)), sectorCode, hauler, destA)
  const front3 = createFrontDefinition(must(createFrontId(sectorCode, 3)), sectorCode, hauler, destB)

  const fleet1 = must(createBaseFleetDefinition({ fleetId: fixtureFleetId('FLEET-1'), frontId: front1.frontId, truckIds: [] }))
  const fleet2 = must(
    createDerivedFleetDefinition({
      fleetId: fixtureFleetId('FLEET-2'),
      frontId: front2.frontId,
      referenceFleetId: fleet1.fleetId,
      addedTruckIds: [],
      removedTruckIds: [],
    }),
  )
  const fleet3 = must(createBaseFleetDefinition({ fleetId: fixtureFleetId('FLEET-3'), frontId: front3.frontId, truckIds: [] }))

  return must(createFleetSetup({ fronts: [front1, front2, front3], fleets: [fleet1, fleet2, fleet3] }, masterData))
}

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

// `isFrontTruckSelectionCurrent` was removed (Phase 18 §5/§6): the Pile
// Operation checker no longer offers a Front dropdown to go stale
// against — the Front is fixed from route context and validated once by
// `operationalFleetOptionForFront` below, and the Truck checker allows
// any known master Truck (a stale-effective-membership re-check no
// longer applies once Wrong Truck is a recordable outcome).

describe('operationalFleetOptionsForPile', () => {
  it('keeps a Front with no configured Destination available for every Pile (legacy/unscoped behavior)', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = operationalFleetOptionsForPile(masterData, fleetSetup, fixturePileId('ANY_PILE'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(1)
    expect(result.value[0]?.frontId).toBe(FIXTURE_FRONT_ID)
  })

  it('excludes a HISTORICAL Front even when its Destination matches the opened Pile', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildScopedFleetSetup(masterData)

    const result = operationalFleetOptionsForPile(masterData, fleetSetup, fixturePileId('DEST-A'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // F1 is historical (superseded by F2) — only F2 (its active successor) appears for DEST-A.
    expect(result.value.map((option) => option.frontId)).toEqual([must(createFrontId(masterData.sectors[0]!.code, 2))])
  })

  it('filters an ACTIVE Front out when its Destination does not match the opened Pile', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildScopedFleetSetup(masterData)

    const resultForDestB = operationalFleetOptionsForPile(masterData, fleetSetup, fixturePileId('DEST-B'))

    expect(resultForDestB.ok).toBe(true)
    if (!resultForDestB.ok) return
    expect(resultForDestB.value.map((option) => option.frontId)).toEqual([
      must(createFrontId(masterData.sectors[0]!.code, 3)),
    ])
  })

  it('still offers an ACTIVE Front independently for its own matching Destination', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildScopedFleetSetup(masterData)

    const resultForDestA = operationalFleetOptionsForPile(masterData, fleetSetup, fixturePileId('DEST-A'))
    expect(resultForDestA.ok).toBe(true)
    if (!resultForDestA.ok) return
    expect(resultForDestA.value).toHaveLength(1)
  })
})

describe('operationalFleetOptionForFront', () => {
  it('resolves the named Front when it is ACTIVE and its Destination matches the opened Pile', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = operationalFleetOptionForFront(masterData, fleetSetup, fixturePileId('ANY_PILE'), FIXTURE_FRONT_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ fleetId: FIXTURE_FLEET_ID, frontId: FIXTURE_FRONT_ID })
  })

  it('fails with one stable code for an unknown Front', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = operationalFleetOptionForFront(masterData, fleetSetup, fixturePileId('ANY_PILE'), 'NOPE/99')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_AVAILABLE_FOR_PILE')
  })

  it('fails with the same stable code for a HISTORICAL Front', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildScopedFleetSetup(masterData)

    // F1 was superseded by F2 (see buildScopedFleetSetup) — historical, not selectable.
    const result = operationalFleetOptionForFront(masterData, fleetSetup, fixturePileId('DEST-A'), 'F1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_AVAILABLE_FOR_PILE')
  })

  it('fails with the same stable code when the Front\'s Destination does not match the opened Pile', () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildScopedFleetSetup(masterData)

    // F3's destination is DEST-B, not DEST-A.
    const result = operationalFleetOptionForFront(masterData, fleetSetup, fixturePileId('DEST-A'), 'F3')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FRONT_NOT_AVAILABLE_FOR_PILE')
  })
})
