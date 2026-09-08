import type { Brand } from '../common/brand'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { EmployeeId, FleetId, FrontId, ProductionCorrectionId, TruckId } from '../common/identifiers'
import type { BatchPosition } from '../batch/batch-position'
import type { TruckValidationResult } from '../fleet/truck-validation'
import type { HaulageTransaction } from '../haulage/haulage-transaction'

/** Field condition of the sampled material at the point of production recording. */
export const PHYSICAL_CONDITIONS = ['DRY', 'MOIST', 'WET', 'MUDDY'] as const
export type PhysicalCondition = (typeof PHYSICAL_CONDITIONS)[number]

export function isPhysicalCondition(value: string): value is PhysicalCondition {
  return (PHYSICAL_CONDITIONS as readonly string[]).includes(value)
}

/** Contamination classification observed at the point of production recording. */
export const CONTAMINATIONS = ['CLN', 'OVR', 'OGC', 'TRH'] as const
export type Contamination = (typeof CONTAMINATIONS)[number]

export function isContamination(value: string): value is Contamination {
  return (CONTAMINATIONS as readonly string[]).includes(value)
}

/** The operator's accept/reject decision for this production record. */
export const DISPOSITIONS = ['ACCEPT', 'REJECT'] as const
export type Disposition = (typeof DISPOSITIONS)[number]

export function isDisposition(value: string): value is Disposition {
  return (DISPOSITIONS as readonly string[]).includes(value)
}

/** Lifecycle status of a ProductionRecord — VOIDED is set only by a future VOID_RECORD correction, never at creation. */
export const PRODUCTION_RECORD_STATUSES = ['ACTIVE', 'VOIDED'] as const
export type ProductionRecordStatus = (typeof PRODUCTION_RECORD_STATUSES)[number]

/**
 * Kinds of correction that may be applied to a ProductionRecord. Only the
 * model is defined here — no EDIT_FIELDS/SWITCH_POSITION/VOID_RECORD
 * behavior is implemented yet.
 */
export const PRODUCTION_CORRECTION_TYPES = ['EDIT_FIELDS', 'SWITCH_POSITION', 'VOID_RECORD'] as const
export type ProductionCorrectionType = (typeof PRODUCTION_CORRECTION_TYPES)[number]

/**
 * The mutable fields of a ProductionRecord — everything that can change
 * over the record's life via a correction, as opposed to `transaction`
 * (the immutable original HaulageTransaction, never corrected).
 * `physicalCondition`/`contamination` are `null` only for a legacy
 * migrated record, where no operator ever observed them (do not invent a
 * default). `remark` is `null` when absent or blank. `truckValidation` is
 * the Wrong Truck classification for the *current* effective Front/Truck
 * — it starts out equal to `transaction.truckValidation` (Phase 2/3) and
 * only ever diverges from it once a Phase 4 EDIT_FIELDS correction
 * changes Front/Truck, re-running the same Phase 5 classification engine
 * (`validateTruckForFleet`) against the new selection. Every downstream
 * "is this Wrong Truck" projection must read this field, never
 * `transaction.truckValidation`, once a record may have been corrected.
 */
export interface ProductionEffectiveFields {
  readonly batchPosition: BatchPosition
  readonly frontId: FrontId
  readonly fleetId: FleetId
  readonly truckId: TruckId
  readonly truckValidation: TruckValidationResult
  readonly physicalCondition: PhysicalCondition | null
  readonly contamination: Contamination | null
  readonly disposition: Disposition
  readonly remark: string | null
  readonly status: ProductionRecordStatus
}

/**
 * One correction event applied to a ProductionRecord's effective fields.
 * Model only — nothing in this module constructs one yet; that is left
 * to the future EDIT_FIELDS/SWITCH_POSITION/VOID_RECORD implementation.
 */
export interface ProductionCorrectionEvent {
  readonly id: ProductionCorrectionId
  readonly type: ProductionCorrectionType
  readonly reason: string
  readonly before: ProductionEffectiveFields
  readonly after: ProductionEffectiveFields
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
}

/**
 * Who created/last updated this ProductionRecord and its correction
 * history. `createdAt`/`createdBy`/`updatedAt`/`updatedBy` are `null`
 * only for a legacy migrated record, where no operator action ever
 * happened (do not invent a timestamp/user). `corrections` starts empty
 * for both a new operator-created record and a legacy migrated one.
 */
export interface ProductionAudit {
  readonly createdAt: Date | null
  readonly createdBy: EmployeeId | null
  readonly updatedAt: Date | null
  readonly updatedBy: EmployeeId | null
  readonly corrections: readonly ProductionCorrectionEvent[]
}

/** Raw shape of a ProductionRecord. Use `createProductionRecord`/`createLegacyProductionRecord` to obtain a validated `ProductionRecord`. */
export interface ProductionRecordData {
  readonly transaction: HaulageTransaction
  readonly effective: ProductionEffectiveFields
  readonly audit: ProductionAudit
}

/**
 * A validated production record: an immutable original HaulageTransaction
 * plus the operator-observed/correctable production fields around it.
 * Branded so a raw ProductionRecordData-shaped object cannot be assigned
 * directly — the only way to obtain one is `createProductionRecord()` or
 * `createLegacyProductionRecord()`.
 */
export type ProductionRecord = Brand<ProductionRecordData, 'ProductionRecord'>

export interface CreateProductionRecordParams {
  readonly transaction: HaulageTransaction
  readonly physicalCondition: PhysicalCondition
  readonly contamination: Contamination
  readonly disposition: Disposition
  /** Optional; blank or whitespace-only is normalized to `null`. */
  readonly remark?: string | null
  readonly createdAt: Date
  readonly createdBy: EmployeeId
}

function normalizeRemark(remark: string | null | undefined): string | null {
  if (remark == null) {
    return null
  }
  const trimmed = remark.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Creates a new operator-created ProductionRecord around an already
 * validated HaulageTransaction. `effective.batchPosition`/`frontId`/
 * `fleetId`/`truckId` start out equal to the transaction's own values —
 * a future SWITCH_POSITION correction is what would ever diverge them.
 * `status` always starts `ACTIVE`; only a future VOID_RECORD correction
 * can set `VOIDED`. `corrections` starts empty.
 */
export function createProductionRecord(
  params: CreateProductionRecordParams,
): Result<ProductionRecord, DomainError> {
  if (!isPhysicalCondition(params.physicalCondition)) {
    return err({
      code: 'INVALID_PHYSICAL_CONDITION',
      message: `Invalid PhysicalCondition: ${String(params.physicalCondition)}`,
    })
  }
  if (!isContamination(params.contamination)) {
    return err({
      code: 'INVALID_CONTAMINATION',
      message: `Invalid Contamination: ${String(params.contamination)}`,
    })
  }
  if (!isDisposition(params.disposition)) {
    return err({
      code: 'INVALID_DISPOSITION',
      message: `Invalid Disposition: ${String(params.disposition)}`,
    })
  }

  const data: ProductionRecordData = {
    transaction: params.transaction,
    effective: {
      batchPosition: params.transaction.batchPosition,
      frontId: params.transaction.frontId,
      fleetId: params.transaction.fleetId,
      truckId: params.transaction.truckId,
      truckValidation: params.transaction.truckValidation,
      physicalCondition: params.physicalCondition,
      contamination: params.contamination,
      disposition: params.disposition,
      remark: normalizeRemark(params.remark),
      status: 'ACTIVE',
    },
    audit: {
      createdAt: params.createdAt,
      createdBy: params.createdBy,
      updatedAt: null,
      updatedBy: null,
      corrections: [],
    },
  }
  return ok(data as ProductionRecord)
}

/**
 * Builds the ProductionRecord for a HaulageTransaction that predates
 * production recording (legacy migrated data, e.g. the v4 -> v5 local
 * database migration). Never fails and never invents an observation:
 * `physicalCondition`/`contamination`/`remark` are `null`,
 * `createdAt`/`createdBy`/`updatedAt`/`updatedBy` are `null`,
 * `disposition` is `ACCEPT`, `status` is `ACTIVE`, and `corrections` is
 * empty. `effective.batchPosition`/`frontId`/`fleetId`/`truckId` equal
 * the original transaction's own values.
 */
export function createLegacyProductionRecord(transaction: HaulageTransaction): ProductionRecord {
  const data: ProductionRecordData = {
    transaction,
    effective: {
      batchPosition: transaction.batchPosition,
      frontId: transaction.frontId,
      fleetId: transaction.fleetId,
      truckId: transaction.truckId,
      truckValidation: transaction.truckValidation,
      physicalCondition: null,
      contamination: null,
      disposition: 'ACCEPT',
      remark: null,
      status: 'ACTIVE',
    },
    audit: {
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null,
      corrections: [],
    },
  }
  return data as ProductionRecord
}
