import type { Brand } from '../common/brand'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { parsePositiveInteger } from '../common/validators'
import type { PackingConfigValue, SamplingInterval } from '../master/sampling-config'

/**
 * Total Bag for one Sample Position. May be fractional (e.g. a single
 * LIM sampled Rit contributes 0.5) — never rounded. Only ever produced
 * by `calculateTotalBag`; a Sample Position's Total Bag is a calculated
 * snapshot and must never be caller-supplied (BR-SP §15 / "current
 * calculation" boundary, docs/ROADMAP.md Phase 11 §6/§12).
 */
export type TotalBag = Brand<number, 'TotalBag'>

/**
 * CONFIRMED_CURRENT_BEHAVIOR (BUSINESS_RULES.md §15/§27): replicates the
 * workbook's current calculation only —
 *   bag contribution per sampled Rit = SamplingInterval / Packing
 *   Total Bag = sampled Rit count * that contribution
 * The operational/physical meaning of `Packing` is NEEDS_CONFIRMATION
 * and is never interpreted here (no "packing = rit per bag" or similar
 * claim). No rounding is applied.
 *
 * SAP example: interval 2, packing 2 -> 1 bag per sampled Rit; 5 sampled
 * Rits -> Total Bag 5.
 * LIM example: interval 5, packing 10 -> 0.5 bag per sampled Rit; 10
 * sampled Rits -> Total Bag 5; 20 sampled Rits -> Total Bag 10.
 *
 * Hardened inputs/output:
 *  - `sampledRitCount` must be a positive integer
 *    (INVALID_SAMPLED_RIT_COUNT otherwise) — a zero, negative,
 *    fractional, or non-finite count is rejected explicitly rather than
 *    silently producing a zero/negative/NaN Total Bag.
 *  - the computed Total Bag itself must be finite
 *    (TOTAL_BAG_NOT_FINITE) and strictly greater than zero
 *    (TOTAL_BAG_NOT_POSITIVE). `interval`/`packing` are already
 *    guaranteed positive integers by their own branded types, so these
 *    two checks are defensive invariants rather than reachable through
 *    normal construction — they exist so a future change to this
 *    function's arithmetic cannot silently produce an invalid Total Bag.
 *  - fractional results (e.g. 0.5) remain valid and are never rounded.
 */
export function calculateTotalBag(
  sampledRitCount: number,
  interval: SamplingInterval,
  packing: PackingConfigValue,
): Result<TotalBag, DomainError> {
  const parsedCount = parsePositiveInteger('Sampled Rit count', 'INVALID_SAMPLED_RIT_COUNT', sampledRitCount)
  if (!parsedCount.ok) {
    return parsedCount
  }

  const perSampledRit = Number(interval) / Number(packing)
  const totalBag = parsedCount.value * perSampledRit

  if (!Number.isFinite(totalBag)) {
    return err({
      code: 'TOTAL_BAG_NOT_FINITE',
      message: `Calculated Total Bag ${totalBag} is not a finite number`,
    })
  }
  if (totalBag <= 0) {
    return err({
      code: 'TOTAL_BAG_NOT_POSITIVE',
      message: `Calculated Total Bag ${totalBag} must be greater than zero`,
    })
  }

  return ok(totalBag as TotalBag)
}
