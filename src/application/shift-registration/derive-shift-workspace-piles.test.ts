import { describe, expect, it } from 'vitest'
import { deriveShiftWorkspacePiles } from './derive-shift-workspace-piles'
import { parseOreCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import { createPile } from '@/domain/pile/pile'
import {
  buildFixtureHandoverPendingSample,
  buildFixturePendingBatchCarryOver,
} from '@/infrastructure/local-db/local-db-test-fixtures'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

describe('deriveShiftWorkspacePiles', () => {
  it('A. no handover (Start Without Previous Shift) initializes with zero piles — master pileAreas are never preloaded', () => {
    const piles = deriveShiftWorkspacePiles([], [])

    expect(piles).toEqual([])
  })

  it('B. a handover initializes only the carry-over piles, using their own carried Ore', () => {
    const pile1 = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    const pile2 = createPile(must(parsePileId('PILE-2')), must(parseOreCode('LIM')))
    const pendingBatches = [
      buildFixturePendingBatchCarryOver(pile1, 3, 18, 'CONTINUE'),
      buildFixturePendingBatchCarryOver(pile2, 1, 5, 'HOLD'),
    ]

    const piles = deriveShiftWorkspacePiles(pendingBatches, [])

    expect(piles.map((pile) => pile.id).sort()).toEqual(['PILE-1', 'PILE-2'])
    expect(piles.find((pile) => pile.id === 'PILE-2')?.oreCode).toBe('LIM')
  })

  it('C. a Pile referenced only by a pending sample carry-over is included', () => {
    const samplePile = createPile(must(parsePileId('PILE-SAMPLE')), must(parseOreCode('SAP')))
    const pendingSamples = [
      buildFixtureHandoverPendingSample({ pile: samplePile, batch: 1, ritFrom: 1, ritTo: 2, sourceShiftId: 'prev-shift' }),
    ]

    const piles = deriveShiftWorkspacePiles([], pendingSamples)

    expect(piles.map((pile) => pile.id)).toEqual(['PILE-SAMPLE'])
  })

  it('D. a Pile referenced by both a pending batch and a pending sample is not duplicated', () => {
    const pile = createPile(must(parsePileId('PILE-1')), must(parseOreCode('SAP')))
    const pendingBatches = [buildFixturePendingBatchCarryOver(pile, 3, 18, 'CONTINUE')]
    const pendingSamples = [
      buildFixtureHandoverPendingSample({ pile, batch: 3, ritFrom: 19, ritTo: 20, sourceShiftId: 'prev-shift' }),
    ]

    const piles = deriveShiftWorkspacePiles(pendingBatches, pendingSamples)

    expect(piles.filter((candidate) => candidate.id === 'PILE-1')).toHaveLength(1)
  })

  it('E. a sector with many master pile areas never leaks into workspace piles — this function does not consume MasterData at all', () => {
    // No MasterData parameter exists on this function's signature by
    // design (Phase 18 correction): there is no way for it to preload
    // sector pile areas, however many exist.
    const piles = deriveShiftWorkspacePiles([], [])

    expect(piles).toHaveLength(0)
  })
})
