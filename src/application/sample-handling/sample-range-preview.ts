import type { RitNumber } from '@/domain/batch/rit-number'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import { buildSampleRange, type SampleRange } from '@/domain/sample-handling/sample-range'
import { calculateTotalBag, type TotalBag } from '@/domain/sample-handling/total-bag'

export interface SampleRangePreview {
  readonly range: SampleRange
  readonly totalBag: TotalBag
}

/**
 * Live Sample Range / Total Bag preview for the Handle Sample editor
 * (docs/ROADMAP.md Phase 11 §32). A small compose-only function — looks
 * up the Pile's Ore configuration, then delegates to the Phase 11
 * range/bag domain engines. React must call this rather than
 * recalculating modulo/Total Bag arithmetic in JSX.
 */
export function previewSampleRange(
  pile: Pile,
  masterData: MasterData,
  ritFrom: RitNumber,
  ritTo: RitNumber,
): Result<SampleRangePreview, DomainError> {
  const oreSamplingConfig = findOreSamplingConfig(masterData, pile.oreCode)
  if (!oreSamplingConfig) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${pile.oreCode}`,
    })
  }

  const range = buildSampleRange({
    ritFrom,
    ritTo,
    interval: oreSamplingConfig.interval,
    batchSize: oreSamplingConfig.batchSize,
  })
  if (!range.ok) {
    return range
  }

  const totalBag = calculateTotalBag(
    range.value.sampledRitNumbers.length,
    oreSamplingConfig.interval,
    oreSamplingConfig.packing,
  )
  if (!totalBag.ok) {
    return totalBag
  }

  return ok({ range: range.value, totalBag: totalBag.value })
}
