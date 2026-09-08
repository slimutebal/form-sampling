import type { BatchNumber } from '@/domain/batch/batch-number'
import type { BatchPosition } from '@/domain/batch/batch-position'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { SampleIncrementNumber } from '@/domain/sampling/sampling-engine'
import { previewNextSampling } from '@/application/haulage-operation/next-sampling-preview'

/**
 * The effective sampling requirement for one Batch/Rit position, derived
 * fresh from the *current* Pile Ore's SamplingInterval (Phase 4 §17) —
 * never copied from any HaulageTransaction's own immutable
 * `samplingEvaluation` snapshot, which records only what was true at the
 * moment that transaction was originally recorded, not what a corrected
 * position now requires.
 */
export interface EffectiveSamplingRequirement {
  readonly batchNumber: BatchNumber
  readonly ritNumber: RitNumber
  readonly sampleRequired: boolean
  readonly incrementNumber?: SampleIncrementNumber
}

/**
 * Derives the effective sampling requirement for one candidate
 * BatchPosition (Phase 4 §17) by reusing the existing
 * `previewNextSampling` engine (Ore config lookup -> BatchPosition
 * validation -> sampling evaluation) — never a second sampling-rule
 * implementation. This is the one function a Switch Sample Impact check
 * must call for both the "before" (source's current position) and
 * "after" (target position) side of the comparison.
 */
export function deriveEffectiveSamplingRequirement(
  pile: Pile,
  masterData: MasterData,
  position: BatchPosition,
): Result<EffectiveSamplingRequirement, DomainError> {
  const preview = previewNextSampling(pile, masterData, position)
  if (!preview.ok) {
    return preview
  }
  const evaluation = preview.value.samplingEvaluation
  return ok({
    batchNumber: position.batchNumber,
    ritNumber: position.ritNumber,
    sampleRequired: evaluation.sampleRequired,
    incrementNumber: evaluation.sampleRequired ? evaluation.incrementNumber : undefined,
  })
}

/** Compares a before/after `EffectiveSamplingRequirement` pair (Phase 4 §16) — `changed` is true exactly when `sampleRequired` flips either direction (SAMPLE -> NO SAMPLE or NO SAMPLE -> SAMPLE); a SAMPLE -> SAMPLE or NO SAMPLE -> NO SAMPLE never warns, even if the increment number itself differs. */
export interface ProductionSampleImpact {
  readonly changed: boolean
  readonly before: EffectiveSamplingRequirement
  readonly after: EffectiveSamplingRequirement
}

export function deriveSampleImpact(
  before: EffectiveSamplingRequirement,
  after: EffectiveSamplingRequirement,
): ProductionSampleImpact {
  return { changed: before.sampleRequired !== after.sampleRequired, before, after }
}
