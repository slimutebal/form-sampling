import type { BatchPosition } from '@/domain/batch/batch-position'
import type { EmployeeId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { recordHaulage } from '@/application/haulage-operation/create-haulage-record'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import {
  createProductionRecord,
  type Contamination,
  type Disposition,
  type PhysicalCondition,
  type ProductionRecord,
} from '@/domain/production/production-record'
import type { Shift } from '@/domain/shift/shift'

export interface RecordProductionParams {
  readonly generatedTransactionId: string
  readonly shift: Shift
  readonly pile: Pile
  readonly nextPosition: BatchPosition
  readonly selectedFleetId: string
  readonly selectedTruckId: string
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  readonly physicalCondition: PhysicalCondition
  readonly contamination: Contamination
  readonly disposition: Disposition
  /** Optional; blank or whitespace-only is normalized to `null` by `createProductionRecord`. */
  readonly remark?: string | null
  readonly createdAt: Date
  readonly createdBy: EmployeeId
}

export interface RecordProductionResult {
  readonly transaction: HaulageTransaction
  readonly productionRecord: ProductionRecord
}

/**
 * Production Record write-flow orchestration (Phase 2 — Production
 * Record final UI + write flow). Composes only existing engines, never
 * constructs a raw HaulageTransaction/ProductionRecord itself:
 *  1. `recordHaulage` (Phase 10) — validates and builds the
 *     HaulageTransaction (BatchPosition/Rit derivation, Wrong Truck
 *     classification, SamplingEvaluation) exactly as the normal haulage
 *     workflow does. Disposition never influences this step — a REJECT
 *     transaction is validated and sampled identically to an ACCEPT one,
 *     so its SamplingEvaluation snapshot stays meaningful for audit even
 *     though a REJECT record is never eligible for a pending physical
 *     sample (`@/application/production/effective-production`).
 *  2. `createProductionRecord` — wraps that transaction with the
 *     operator-observed PhysicalCondition/Contamination/Disposition/
 *     remark.
 * Returns both so the caller can persist them together, atomically, via
 * `LocalOperationalStore.addProductionTransaction`.
 */
export function recordProduction(
  params: RecordProductionParams,
): Result<RecordProductionResult, DomainError> {
  const transactionResult = recordHaulage({
    generatedTransactionId: params.generatedTransactionId,
    shift: params.shift,
    pile: params.pile,
    nextPosition: params.nextPosition,
    selectedFleetId: params.selectedFleetId,
    selectedTruckId: params.selectedTruckId,
    masterData: params.masterData,
    fleetSetup: params.fleetSetup,
  })
  if (!transactionResult.ok) {
    return transactionResult
  }

  const productionRecordResult = createProductionRecord({
    transaction: transactionResult.value,
    physicalCondition: params.physicalCondition,
    contamination: params.contamination,
    disposition: params.disposition,
    remark: params.remark,
    createdAt: params.createdAt,
    createdBy: params.createdBy,
  })
  if (!productionRecordResult.ok) {
    return productionRecordResult
  }

  return ok({ transaction: transactionResult.value, productionRecord: productionRecordResult.value })
}
