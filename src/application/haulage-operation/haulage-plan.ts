import type { BatchPosition } from '@/domain/batch/batch-position'
import type { Pile } from '@/domain/pile/pile'

/**
 * The authoritative haulage plan for one Pile within a Shift
 * (docs/ROADMAP.md Phase 10 §5). `expectedPositions` is the ordered
 * ground truth for current/next position, recorded-position matching,
 * skipped detection, and operational display order — it must never be
 * derived from `HaulageTransaction` array/IndexedDB storage order
 * (LocalOperationalStore explicitly does not guarantee that order).
 *
 * A future Phase 12 handover/planning step is expected to produce this
 * sequence from pending history. Phase 10 only *consumes* it as
 * caller-supplied input: for a fresh Pile with no confirmed initial
 * Batch seed, no part of this feature invents one (no "Batch 1 / Rit 1"
 * fallback).
 */
export interface PileHaulagePlan {
  readonly pile: Pile
  readonly expectedPositions: readonly BatchPosition[]
}
