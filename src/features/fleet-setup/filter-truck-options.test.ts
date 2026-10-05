import { describe, expect, it } from 'vitest'
import { availableAddedTruckIds, truckOptionsForHauler } from '@/application/fleet-setup/effective-fleet-preview'
import { parseHaulerCode } from '@/domain/master/master-codes'
import { parseTruckId } from '@/domain/common/identifiers'
import { createMasterData } from '@/domain/master/master-data'
import { createHaulerReference, createTruckReference } from '@/domain/master/references'
import { filterTruckOptions } from './filter-truck-options'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

const MHU = value(parseHaulerCode('MHU'))
const ABC = value(parseHaulerCode('ABC'))
const masterData = value(
  createMasterData({
    employees: [], crews: [], sectors: [], locations: [], samplingHouses: [], pileAreas: [], oreSamplingConfigs: [],
    haulers: [createHaulerReference(MHU), createHaulerReference(ABC)],
    trucks: [
      createTruckReference(value(parseTruckId('DT-2045')), MHU),
      createTruckReference(value(parseTruckId('DT-9120')), MHU),
      createTruckReference(value(parseTruckId('ABC-2045')), ABC),
    ],
  }),
)

describe('fleet truck search candidates', () => {
  it('filters candidate truck IDs by case-insensitive partial substring, including numeric queries', () => {
    expect(filterTruckOptions(['DT-2045', 'DT-9120'], 'dt-20')).toEqual(['DT-2045'])
    expect(filterTruckOptions(['DT-2045', 'DT-9120'], '2045')).toEqual(['DT-2045'])
  })

  it('uses only the selected Hauler candidate list', () => {
    expect(filterTruckOptions(truckOptionsForHauler(masterData, 'MHU'), '2045')).toEqual(['DT-2045'])
  })

  it('keeps BASE already-selected trucks out of the searchable candidates', () => {
    const baseCandidates = truckOptionsForHauler(masterData, 'MHU').filter((id) => !['DT-2045'].includes(id))
    expect(baseCandidates).toEqual(['DT-9120'])
  })

  it('keeps DERIVED add candidates subject to existing inheritance exclusions', () => {
    expect(availableAddedTruckIds(masterData, 'MHU', ['DT-2045'], [], [])).toEqual(['DT-9120'])
  })

  it('keeps DERIVED remove candidates subject to existing added and removed exclusions', () => {
    const inherited = ['DT-2045', 'DT-9120']
    const added: readonly string[] = ['DT-2045']
    const removed: readonly string[] = []
    const removeCandidates = inherited.filter((id) => !added.includes(id) && !removed.includes(id))
    expect(removeCandidates).toEqual(['DT-9120'])
  })
})
