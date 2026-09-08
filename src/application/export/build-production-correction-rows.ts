import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Machine-readable, language-neutral archive row for the
 * `Production_Correction` sheet (Phase 22 §5) — one row per
 * `ProductionCorrectionEvent`, flattened out of every ProductionRecord's
 * `audit.corrections`. Only stable internal codes appear here (Correction
 * Type, Batch/Rit numbers, Front/Truck ids, Physical Condition,
 * Contamination, Disposition, Status) — never a localized label.
 */
export interface ExportProductionCorrectionRow {
  readonly Correction_ID: string
  readonly Transaction_ID: string
  readonly Correction_Type: string
  readonly Reason: string
  readonly Corrected_At: string
  readonly Corrected_By: string

  readonly Before_Batch: number
  readonly Before_Rit: number
  readonly After_Batch: number
  readonly After_Rit: number

  readonly Before_Front_ID: string
  readonly After_Front_ID: string

  readonly Before_Truck_ID: string
  readonly After_Truck_ID: string

  readonly Before_Physical_Condition: string
  readonly After_Physical_Condition: string

  readonly Before_Contamination: string
  readonly After_Contamination: string

  readonly Before_Disposition: string
  readonly After_Disposition: string

  readonly Before_Status: string
  readonly After_Status: string
}

/**
 * Flattens every ProductionRecord's correction history into archive rows
 * (Phase 22 §5). A record with no corrections contributes no rows — this
 * sheet is an event log, not a per-record listing. `Transaction_ID` ties
 * each correction back to its owning `Haulage_Detail` row (the
 * ProductionRecord's immutable `transaction.id`).
 */
export function buildProductionCorrectionRows(
  productionRecords: readonly ProductionRecord[],
): readonly ExportProductionCorrectionRow[] {
  const rows: ExportProductionCorrectionRow[] = []

  for (const record of productionRecords) {
    for (const correction of record.audit.corrections) {
      rows.push({
        Correction_ID: String(correction.id),
        Transaction_ID: String(record.transaction.id),
        Correction_Type: correction.type,
        Reason: correction.reason,
        Corrected_At: correction.correctedAt.toISOString(),
        Corrected_By: String(correction.correctedBy),

        Before_Batch: Number(correction.before.batchPosition.batchNumber),
        Before_Rit: Number(correction.before.batchPosition.ritNumber),
        After_Batch: Number(correction.after.batchPosition.batchNumber),
        After_Rit: Number(correction.after.batchPosition.ritNumber),

        Before_Front_ID: String(correction.before.frontId),
        After_Front_ID: String(correction.after.frontId),

        Before_Truck_ID: String(correction.before.truckId),
        After_Truck_ID: String(correction.after.truckId),

        Before_Physical_Condition: correction.before.physicalCondition ?? '',
        After_Physical_Condition: correction.after.physicalCondition ?? '',

        Before_Contamination: correction.before.contamination ?? '',
        After_Contamination: correction.after.contamination ?? '',

        Before_Disposition: correction.before.disposition,
        After_Disposition: correction.after.disposition,

        Before_Status: correction.before.status,
        After_Status: correction.after.status,
      })
    }
  }

  return rows
}
