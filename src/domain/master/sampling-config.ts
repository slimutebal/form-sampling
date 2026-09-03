import type { Brand } from '../common/brand'
import type { OreCode } from '../common/codes'
import type { Result } from '../common/result'
import { ok } from '../common/result'
import { parsePositiveInteger } from '../common/validators'

/**
 * Sampling interval configuration value (`Int_Sample.Inc`, BR-MASTER-002).
 * This is master configuration only — it does not decide whether a
 * given rit is a sample (that is a Phase 4 sampling-engine concern).
 */
export type SamplingInterval = Brand<number, 'SamplingInterval'>

export function parseSamplingInterval(value: number): Result<SamplingInterval> {
  const parsed = parsePositiveInteger('Sampling interval', 'INVALID_SAMPLING_INTERVAL', value)
  if (!parsed.ok) {
    return parsed
  }
  return ok(parsed.value as SamplingInterval)
}

/**
 * Batch-size configuration value (`Int_Sample.Batch`, BR-MASTER-002 /
 * BR-BATCH-001). This is the configured capacity of a batch for an ore,
 * not a specific batch instance's sequence number (see BatchNumber).
 * Rollover behavior is a Phase 4 concern and is not implemented here.
 */
export type BatchSize = Brand<number, 'BatchSize'>

export function parseBatchSize(value: number): Result<BatchSize> {
  const parsed = parsePositiveInteger('Batch size', 'INVALID_BATCH_SIZE', value)
  if (!parsed.ok) {
    return parsed
  }
  return ok(parsed.value as BatchSize)
}

/**
 * Stored numeric value of the workbook's `Int_Sample.Packing` field.
 * Its operational meaning is NEEDS_CONFIRMATION per BUSINESS_RULES.md
 * §27 — this type intentionally only validates and stores the value.
 * No bag/packing-ratio calculation may be derived from it here.
 */
export type PackingConfigValue = Brand<number, 'PackingConfigValue'>

export function parsePackingConfigValue(value: number): Result<PackingConfigValue> {
  const parsed = parsePositiveInteger('Packing config value', 'INVALID_PACKING_CONFIG_VALUE', value)
  if (!parsed.ok) {
    return parsed
  }
  return ok(parsed.value as PackingConfigValue)
}

/**
 * Immutable ore sampling configuration (BR-MASTER-002). OreCode is
 * intentionally not a closed enum — future ore codes must remain
 * representable without a code change.
 */
export interface OreSamplingConfig {
  readonly oreCode: OreCode
  readonly interval: SamplingInterval
  readonly batchSize: BatchSize
  readonly packing: PackingConfigValue
}

export function createOreSamplingConfig(params: {
  oreCode: OreCode
  interval: SamplingInterval
  batchSize: BatchSize
  packing: PackingConfigValue
}): OreSamplingConfig {
  return { ...params }
}
