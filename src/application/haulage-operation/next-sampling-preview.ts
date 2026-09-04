import type { BatchPosition } from '@/domain/batch/batch-position'
import { validateBatchPosition } from '@/domain/batch/batch-position'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { BatchSize } from '@/domain/master/sampling-config'
import type { Pile } from '@/domain/pile/pile'
import type { SamplingEvaluation } from '@/domain/sampling/sampling-engine'
import { evaluateSampling } from '@/domain/sampling/sampling-engine'

export interface NextSamplingPreview {
  readonly batchSize: BatchSize
  readonly samplingEvaluation: SamplingEvaluation
}

/**
 * Computes the sampling preview for one candidate BatchPosition
 * (docs/ROADMAP.md Phase 10 §14): Pile.oreCode → OreSamplingConfig →
 * validate the position against its BatchSize → evaluate sampling. The
 * operator must see whether the *next* Rit is a sample point before
 * selecting a Truck — this must never be an operator choice
 * (BR-SAMPLE-002) and must never reuse `OreSamplingConfig.packing`
 * (packing semantics are NEEDS_CONFIRMATION).
 */
export function previewNextSampling(
  pile: Pile,
  masterData: MasterData,
  position: BatchPosition,
): Result<NextSamplingPreview, DomainError> {
  const config = findOreSamplingConfig(masterData, pile.oreCode)
  if (!config) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${pile.oreCode}`,
    })
  }

  const validated = validateBatchPosition(position, config.batchSize)
  if (!validated.ok) {
    return validated
  }

  return ok({
    batchSize: config.batchSize,
    samplingEvaluation: evaluateSampling(validated.value.ritNumber, config.interval),
  })
}
