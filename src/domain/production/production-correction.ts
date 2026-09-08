import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { EmployeeId, FleetId, FrontId, ProductionCorrectionId, TruckId } from '../common/identifiers'
import type { BatchPosition } from '../batch/batch-position'
import type { TruckValidationResult } from '../fleet/truck-validation'
import {
  isContamination,
  isDisposition,
  isPhysicalCondition,
  type Contamination,
  type Disposition,
  type PhysicalCondition,
  type ProductionCorrectionEvent,
  type ProductionEffectiveFields,
  type ProductionRecord,
  type ProductionRecordData,
} from './production-record'

function normalizeRemark(remark: string | null | undefined): string | null {
  if (remark == null) {
    return null
  }
  const trimmed = remark.trim()
  return trimmed.length === 0 ? null : trimmed
}

function validateReason(reason: string): Result<string, DomainError> {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return err({ code: 'REASON_REQUIRED', message: 'A non-blank correction reason is required' })
  }
  return ok(trimmed)
}

/**
 * Common shape every correction-applying function below returns: the
 * fully rebuilt ProductionRecord (never a partial patch) plus the single
 * `ProductionCorrectionEvent` just appended, so callers that need to
 * write both the SWITCH_POSITION source/target correction with identical
 * `reason`/`correctedAt`/`correctedBy` (Phase 4 §14) can do so without
 * re-deriving the event from the record's own `audit.corrections` array.
 */
export interface ProductionCorrectionResult {
  readonly record: ProductionRecord
  readonly correction: ProductionCorrectionEvent
}

function appendCorrection(
  current: ProductionRecord,
  after: ProductionEffectiveFields,
  correction: ProductionCorrectionEvent,
): ProductionRecord {
  const data: ProductionRecordData = {
    transaction: current.transaction,
    effective: after,
    audit: {
      createdAt: current.audit.createdAt,
      createdBy: current.audit.createdBy,
      updatedAt: correction.correctedAt,
      updatedBy: correction.correctedBy,
      corrections: [...current.audit.corrections, correction],
    },
  }
  return data as ProductionRecord
}

export interface ApplyEditFieldsParams {
  readonly correctionId: ProductionCorrectionId
  readonly frontId: FrontId
  readonly fleetId: FleetId
  readonly truckId: TruckId
  /**
   * The Wrong Truck classification for the edited Front/Truck, already
   * computed by `validateTruckForFleet` (Phase 5 engine) — this function
   * never classifies Wrong Truck itself, only stores what the caller
   * already resolved (Phase 4 §5 "Do not classify Wrong Truck in React"
   * generalizes to "do not reclassify it here either" — the application
   * layer is the one place that re-runs the engine).
   */
  readonly truckValidation: TruckValidationResult
  readonly physicalCondition: PhysicalCondition
  readonly contamination: Contamination
  readonly disposition: Disposition
  /** Optional; blank or whitespace-only is normalized to `null`. */
  readonly remark?: string | null
  readonly reason: string
  /**
   * True when another ACCEPT + ACTIVE ProductionRecord already occupies
   * this record's own Pile/Batch/Rit position (computed by the caller,
   * which alone has access to the full ProductionRecord set — Phase 4
   * §25 invariant). Only checked when `disposition` resolves to ACCEPT;
   * a REJECT never occupies a position, so it can never conflict.
   */
  readonly positionOccupiedByOther: boolean
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
}

/**
 * Applies an EDIT_FIELDS correction (Phase 4 §4/§6/§8) to a
 * ProductionRecord. Batch/Rit position is never touched here — Switch
 * Record (`applySwitchPosition`) is the only mechanism that may change
 * it (§4 "Do not allow Batch/Rit changes through Edit"). `Pile_ID` and
 * the original `Transaction_ID` are structurally fixed already (they
 * live on the immutable `transaction`, never copied into
 * `ProductionEffectiveFields`), so there is nothing here that could
 * accidentally change them.
 *
 * Fails with:
 *  - `RECORD_VOIDED` if the record is already VOIDED (§26 — a VOIDED
 *    record may never be edited);
 *  - `REASON_REQUIRED` if `reason` is blank (§7);
 *  - `INVALID_PHYSICAL_CONDITION`/`INVALID_CONTAMINATION`/
 *    `INVALID_DISPOSITION` for an out-of-range value;
 *  - `PRODUCTION_POSITION_OCCUPIED` if `disposition` resolves to ACCEPT
 *    and `positionOccupiedByOther` is true (§8 "Do not silently allow two
 *    effective ACCEPT+ACTIVE records to occupy the same Pile + Batch +
 *    Rit").
 */
export function applyEditFields(
  record: ProductionRecord,
  params: ApplyEditFieldsParams,
): Result<ProductionRecord, DomainError> {
  if (record.effective.status === 'VOIDED') {
    return err({ code: 'RECORD_VOIDED', message: 'A VOIDED ProductionRecord cannot be edited' })
  }

  const reasonResult = validateReason(params.reason)
  if (!reasonResult.ok) {
    return reasonResult
  }

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

  if (params.disposition === 'ACCEPT' && params.positionOccupiedByOther) {
    return err({
      code: 'PRODUCTION_POSITION_OCCUPIED',
      message: 'Another ACCEPT + ACTIVE ProductionRecord already occupies this Pile/Batch/Rit position',
    })
  }

  const before = record.effective
  const after: ProductionEffectiveFields = {
    ...before,
    frontId: params.frontId,
    fleetId: params.fleetId,
    truckId: params.truckId,
    truckValidation: params.truckValidation,
    physicalCondition: params.physicalCondition,
    contamination: params.contamination,
    disposition: params.disposition,
    remark: normalizeRemark(params.remark),
  }

  const correction: ProductionCorrectionEvent = {
    id: params.correctionId,
    type: 'EDIT_FIELDS',
    reason: reasonResult.value,
    before,
    after,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  }

  return ok(appendCorrection(record, after, correction))
}

export interface ApplySwitchPositionParams {
  readonly correctionId: ProductionCorrectionId
  readonly targetPosition: BatchPosition
  readonly reason: string
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
}

/**
 * Applies a SWITCH_POSITION correction (Phase 4 §9/§13/§14) to one
 * ProductionRecord — either the MOVE source, the SWAP source, or the
 * SWAP target; the caller (`@/application/production/switch-production-
 * record`) decides MOVE vs SWAP and calls this once per involved record,
 * always with the identical `reason`/`correctedAt`/`correctedBy` for both
 * sides of a SWAP (§14).
 *
 * Fails with:
 *  - `RECORD_NOT_SWITCHABLE` unless the record is currently ACCEPT +
 *    ACTIVE (§9 "Switch source must be ACCEPT + ACTIVE" — also covers "a
 *    VOIDED/REJECT record cannot be switched", §26/§28);
 *  - `REASON_REQUIRED` if `reason` is blank.
 * Never validates same-Pile/cross-Pile or target-position
 * availability/conflict itself — those need visibility into every other
 * ProductionRecord and are resolved once by the caller
 * (`planProductionSwitch`) before this is ever invoked.
 */
export function applySwitchPosition(
  record: ProductionRecord,
  params: ApplySwitchPositionParams,
): Result<ProductionRecord, DomainError> {
  if (record.effective.status !== 'ACTIVE' || record.effective.disposition !== 'ACCEPT') {
    return err({
      code: 'RECORD_NOT_SWITCHABLE',
      message: 'Only an ACCEPT + ACTIVE ProductionRecord may be switched',
    })
  }

  const reasonResult = validateReason(params.reason)
  if (!reasonResult.ok) {
    return reasonResult
  }

  const before = record.effective
  const after: ProductionEffectiveFields = {
    ...before,
    batchPosition: params.targetPosition,
  }

  const correction: ProductionCorrectionEvent = {
    id: params.correctionId,
    type: 'SWITCH_POSITION',
    reason: reasonResult.value,
    before,
    after,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  }

  return ok(appendCorrection(record, after, correction))
}

export interface ApplyVoidRecordParams {
  readonly correctionId: ProductionCorrectionId
  readonly reason: string
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
}

/**
 * Applies a VOID_RECORD correction (Phase 4 §2/§19/§20) — the only
 * "delete" this system ever performs. Sets `effective.status` to
 * `VOIDED`; the original `HaulageTransaction` and every prior
 * `ProductionRecord` state remain stored (§2, §21 — this is never a hard
 * delete). Fails with `ALREADY_VOIDED` if the record is already VOIDED,
 * and `REASON_REQUIRED` if `reason` is blank.
 */
export function applyVoidRecord(
  record: ProductionRecord,
  params: ApplyVoidRecordParams,
): Result<ProductionRecord, DomainError> {
  if (record.effective.status === 'VOIDED') {
    return err({ code: 'ALREADY_VOIDED', message: 'This ProductionRecord is already VOIDED' })
  }

  const reasonResult = validateReason(params.reason)
  if (!reasonResult.ok) {
    return reasonResult
  }

  const before = record.effective
  const after: ProductionEffectiveFields = { ...before, status: 'VOIDED' }

  const correction: ProductionCorrectionEvent = {
    id: params.correctionId,
    type: 'VOID_RECORD',
    reason: reasonResult.value,
    before,
    after,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  }

  return ok(appendCorrection(record, after, correction))
}
