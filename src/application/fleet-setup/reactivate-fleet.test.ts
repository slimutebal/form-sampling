import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseFleetId, parseFrontId, parsePileId, parseTruckId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { buildExcaCode } from '@/domain/fleet/exca-code'
import { createBaseFleetDefinition, createDerivedFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFrontDefinition } from '@/domain/fleet/front'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { createFleetSetup } from '@/domain/fleet/fleet-setup'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { createMasterData } from '@/domain/master/master-data'
import { createPileAreaReference } from '@/domain/master/references'
import { buildFixtureMasterData } from '@/test/fixtures/haulage-operation-test-fixtures'
import { reactivateFleet } from './reactivate-fleet'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('reactivateFleet', () => {
  it('treats 02 → 03 → 09 → 02 as temporal transfers, not a lineage cycle', () => {
    const fixtureMasterData = buildFixtureMasterData()
    const masterData = must(createMasterData({
      ...fixtureMasterData,
      pileAreas: [createPileAreaReference(
        fixtureMasterData.sectors[0]!.code,
        must(parsePileAreaCode('STOCK-01')),
        must(parsePileId('S5_01')),
        must(parseOreCode('SAP')),
      )],
    }))
    const sector = must(parseSectorCode('S1'))
    const hauler = must(parseHaulerCode('H1'))
    const pile = must(parsePileId('S5_01'))
    const front02 = createFrontDefinition(must(parseFrontId('S1/02')), sector, hauler, pile)
    const front03 = createFrontDefinition(must(parseFrontId('S1/03')), sector, hauler, pile)
    const front09 = createFrontDefinition(must(parseFrontId('S1/09')), sector, hauler, pile)
    const fleet02 = must(createBaseFleetDefinition({ fleetId: must(parseFleetId('FLEET-02')), frontId: front02.frontId, truckIds: [must(parseTruckId('T1'))] }))
    const fleet03 = must(createDerivedFleetDefinition({ fleetId: must(parseFleetId('FLEET-03')), frontId: front03.frontId, referenceFleetId: fleet02.fleetId, addedTruckIds: [], removedTruckIds: [] }))
    const fleet09 = must(createDerivedFleetDefinition({ fleetId: must(parseFleetId('FLEET-09')), frontId: front09.frontId, referenceFleetId: fleet03.fleetId, addedTruckIds: [], removedTruckIds: [] }))
    const setup = must(createFleetSetup({ fronts: [front02, front03, front09], fleets: [fleet02, fleet03, fleet09] }, masterData))

    const result = reactivateFleet({ fleetSetup: setup, masterData, fleetId: 'FLEET-02', sourceFleetId: 'FLEET-09', truckIds: ['T1'], destinationPileIds: ['S5_01'], excaCode: must(buildExcaCode('H1', '269')), commandId: 'reactivate-02', actorId: 'CHECKER', effectiveAt: new Date('2026-10-19T01:00:00Z'), expectedTargetVersion: 0, expectedSourceVersion: 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lineage = deriveFrontLineage(result.value.fleetSetup)
    expect(lineage.activeFrontIds).toContain(front02.frontId)
    expect(lineage.activeFrontIds).not.toContain(front03.frontId)
    expect(lineage.activeFrontIds).not.toContain(front09.frontId)
    expect(result.value.fleetSetup.fleets.find((fleet) => fleet.fleetId === fleet02.fleetId)?.fleetId).toBe(fleet02.fleetId)
    expect(result.value.fleetSetup.operationalState?.formationTransferEvents).toHaveLength(1)
  })
})
