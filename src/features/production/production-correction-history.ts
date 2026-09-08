import type { ProductionCorrectionEvent, ProductionEffectiveFields } from '@/domain/production/production-record'

/** One changed field between a correction's `before`/`after` snapshot, ready for display (Phase 4 §23 "Only show changed fields between before/after"). */
export interface CorrectionFieldChange {
  readonly field: 'position' | 'frontId' | 'truckId' | 'physicalCondition' | 'contamination' | 'disposition' | 'remark' | 'status'
  readonly before: string
  readonly after: string
}

function displayOrDash(value: string | null): string {
  return value ?? '-'
}

/**
 * Diffs one correction's `before`/`after` `ProductionEffectiveFields`
 * snapshot into only the fields that actually changed (Phase 4 §23) —
 * never a raw JSON dump. `batchNumber`/`ritNumber` are combined into a
 * single `position` entry (mirrors the spec's "Batch 5 Rit 1 → Batch 4
 * Rit 9" example) rather than two separate Batch/Rit rows.
 */
export function diffCorrectionFields(
  before: ProductionEffectiveFields,
  after: ProductionEffectiveFields,
): readonly CorrectionFieldChange[] {
  const changes: CorrectionFieldChange[] = []

  if (
    Number(before.batchPosition.batchNumber) !== Number(after.batchPosition.batchNumber) ||
    Number(before.batchPosition.ritNumber) !== Number(after.batchPosition.ritNumber)
  ) {
    changes.push({
      field: 'position',
      before: `Batch ${Number(before.batchPosition.batchNumber)} Rit ${Number(before.batchPosition.ritNumber)}`,
      after: `Batch ${Number(after.batchPosition.batchNumber)} Rit ${Number(after.batchPosition.ritNumber)}`,
    })
  }
  if (before.frontId !== after.frontId) {
    changes.push({ field: 'frontId', before: before.frontId as string, after: after.frontId as string })
  }
  if (before.truckId !== after.truckId) {
    changes.push({ field: 'truckId', before: before.truckId as string, after: after.truckId as string })
  }
  if (before.physicalCondition !== after.physicalCondition) {
    changes.push({
      field: 'physicalCondition',
      before: displayOrDash(before.physicalCondition),
      after: displayOrDash(after.physicalCondition),
    })
  }
  if (before.contamination !== after.contamination) {
    changes.push({
      field: 'contamination',
      before: displayOrDash(before.contamination),
      after: displayOrDash(after.contamination),
    })
  }
  if (before.disposition !== after.disposition) {
    changes.push({ field: 'disposition', before: before.disposition, after: after.disposition })
  }
  if (before.remark !== after.remark) {
    changes.push({ field: 'remark', before: displayOrDash(before.remark), after: displayOrDash(after.remark) })
  }
  if (before.status !== after.status) {
    changes.push({ field: 'status', before: before.status, after: after.status })
  }

  return changes
}

/** One correction event ready for display, latest-first (Phase 4 §23). */
export interface CorrectionHistoryEntry {
  readonly correction: ProductionCorrectionEvent
  readonly changes: readonly CorrectionFieldChange[]
}

/** Builds the full correction-history view for one ProductionRecord — latest first (Phase 4 §23 "Latest first"). */
export function buildCorrectionHistory(
  corrections: readonly ProductionCorrectionEvent[],
): readonly CorrectionHistoryEntry[] {
  return [...corrections]
    .reverse()
    .map((correction) => ({ correction, changes: diffCorrectionFields(correction.before, correction.after) }))
}
