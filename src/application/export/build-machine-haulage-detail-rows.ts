import { deriveEffectiveSamplingRequirement } from '@/application/production/production-sample-impact'
import type { PileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Machine-readable, language-neutral archive row for the `Haulage_Detail`
 * sheet (Phase 22 §4). Every field is a stable internal code, never a
 * localized label. Original columns are read from the immutable
 * `transaction` snapshot; Effective columns from the current
 * `ProductionRecord.effective` state — both are always present so a
 * corrected record's before/after state stays auditable side by side
 * (§4/§10: original values are never replaced by effective ones).
 */
export interface ExportHaulageDetailRow {
  readonly Transaction_ID: string
  readonly Shift_ID: string
  readonly Pile_ID: string

  readonly Original_Batch: number
  readonly Original_Rit: number
  readonly Original_Front_ID: string
  readonly Original_Fleet_ID: string
  readonly Original_Truck_ID: string

  readonly Effective_Batch: number
  readonly Effective_Rit: number
  readonly Effective_Front_ID: string
  readonly Effective_Fleet_ID: string
  readonly Effective_Truck_ID: string

  readonly Physical_Condition: string
  readonly Contamination: string
  readonly Disposition: string
  readonly Record_Status: string
  readonly Remark: string

  readonly Sample_Required_Original: 'TRUE' | 'FALSE'
  readonly Sample_Required_Effective: 'TRUE' | 'FALSE'

  readonly Truck_Status_Original: string
  readonly Truck_Status_Effective: string

  readonly Created_At: string
  readonly Created_By: string
  readonly Updated_At: string
  readonly Updated_By: string

  readonly Correction_Count: number
}

/**
 * Builds one `Haulage_Detail` row per `ProductionRecord`, with no
 * disposition/status filtering (§8/§9/§10) — VOIDED and REJECT records are
 * preserved in the machine archive exactly like ACCEPT + ACTIVE ones, so
 * the archive stays a complete audit trail rather than a production-only
 * extract (that filtering belongs to the Report projection, not here).
 *
 * `Sample_Required_Original` is copied verbatim from
 * `transaction.samplingEvaluation` (never mutated, §6).
 * `Sample_Required_Effective` is derived fresh from the record's current
 * effective position via `deriveEffectiveSamplingRequirement` (the same
 * engine the Switch Sample Impact check already uses) — never assumed
 * equal to the original when a SWITCH_POSITION correction has moved the
 * record.
 */
export function buildMachineHaulageDetailRows(
  piles: readonly Pile[],
  masterData: MasterData,
  productionRecords: readonly ProductionRecord[],
): Result<readonly ExportHaulageDetailRow[], DomainError> {
  const pileById = new Map<PileId, Pile>()
  for (const pile of piles) {
    pileById.set(pile.id, pile)
  }

  const rows: ExportHaulageDetailRow[] = []
  for (const record of productionRecords) {
    const { transaction, effective, audit } = record
    // Non-null: every record.transaction.pileId is already validated
    // against `piles` by the caller before this function runs.
    const pile = pileById.get(transaction.pileId)!

    const effectiveRequirement = deriveEffectiveSamplingRequirement(pile, masterData, effective.batchPosition)
    if (!effectiveRequirement.ok) {
      return effectiveRequirement
    }

    rows.push({
      Transaction_ID: String(transaction.id),
      Shift_ID: String(transaction.shiftId),
      Pile_ID: String(transaction.pileId),

      Original_Batch: Number(transaction.batchPosition.batchNumber),
      Original_Rit: Number(transaction.batchPosition.ritNumber),
      Original_Front_ID: String(transaction.frontId),
      Original_Fleet_ID: String(transaction.fleetId),
      Original_Truck_ID: String(transaction.truckId),

      Effective_Batch: Number(effective.batchPosition.batchNumber),
      Effective_Rit: Number(effective.batchPosition.ritNumber),
      Effective_Front_ID: String(effective.frontId),
      Effective_Fleet_ID: String(effective.fleetId),
      Effective_Truck_ID: String(effective.truckId),

      Physical_Condition: effective.physicalCondition ?? '',
      Contamination: effective.contamination ?? '',
      Disposition: effective.disposition,
      Record_Status: effective.status,
      Remark: effective.remark ?? '',

      Sample_Required_Original: transaction.samplingEvaluation.sampleRequired ? 'TRUE' : 'FALSE',
      Sample_Required_Effective: effectiveRequirement.value.sampleRequired ? 'TRUE' : 'FALSE',

      Truck_Status_Original: transaction.truckValidation.status,
      Truck_Status_Effective: effective.truckValidation.status,

      Created_At: audit.createdAt ? audit.createdAt.toISOString() : '',
      Created_By: audit.createdBy ? String(audit.createdBy) : '',
      Updated_At: audit.updatedAt ? audit.updatedAt.toISOString() : '',
      Updated_By: audit.updatedBy ? String(audit.updatedBy) : '',

      Correction_Count: audit.corrections.length,
    })
  }

  return ok(rows)
}
