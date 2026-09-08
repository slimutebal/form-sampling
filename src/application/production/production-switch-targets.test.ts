import { describe, expect, it } from 'vitest'
import { deriveProductionSwitchTargets } from '@/application/production/production-switch-targets'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')

function acceptRecord(id: string, batch: number, rit: number) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition: 'ACCEPT' })
}

describe('deriveProductionSwitchTargets', () => {
  it('includes every Batch with production history, each with its own authoritative expected Rits', () => {
    const records = [acceptRecord('TX-1', 4, 3), acceptRecord('TX-2', 5, 2)]
    const result = deriveProductionSwitchTargets(pile, masterData, records)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const batchNumbers = result.value.map((target) => Number(target.batchNumber)).sort((a, b) => a - b)
    expect(batchNumbers).toEqual([4, 5])
    const batch4 = result.value.find((target) => Number(target.batchNumber) === 4)!
    // SAP fixture batchSize 20, no carry-over/fresh-start context for Batch 4 -> defaults to Rit 1 start.
    expect(batch4.ritNumbers.map(Number)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })

  it('never invents a Batch that has no production history and no carry-over row', () => {
    const records = [acceptRecord('TX-1', 4, 3)]
    const result = deriveProductionSwitchTargets(pile, masterData, records)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((target) => Number(target.batchNumber))).toEqual([4])
  })

  it('fails with ORE_SAMPLING_CONFIG_NOT_FOUND when the Pile Ore has no sampling configuration', () => {
    const unknownOrePile = { ...pile, oreCode: 'ZZZ' } as typeof pile
    const result = deriveProductionSwitchTargets(unknownOrePile, masterData, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ORE_SAMPLING_CONFIG_NOT_FOUND')
  })
})
