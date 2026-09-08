import type { EmployeeId } from '@/domain/common/identifiers'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { applyVoidRecord } from '@/domain/production/production-correction'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  generateProductionCorrectionId,
  type ProductionCorrectionIdGenerator,
} from '@/application/production/production-correction-id-generator'

export interface VoidProductionRecordParams {
  readonly record: ProductionRecord
  readonly reason: string
  readonly correctedAt: Date
  readonly correctedBy: EmployeeId
  /** Injectable so tests can supply a fixed id instead of a random UUID. */
  readonly generateCorrectionId?: ProductionCorrectionIdGenerator
}

/**
 * Void Record orchestration (Phase 4 §2/§19/§20) — UI wording is
 * "Delete", but there is no hard delete: this only ever sets
 * `effective.status = 'VOIDED'` and appends a VOID_RECORD correction via
 * the domain `applyVoidRecord` engine. The original HaulageTransaction
 * and every prior ProductionRecord state remain stored untouched. Returns
 * the fully rebuilt ProductionRecord for the caller to persist via
 * `ProductionCorrectionStore.voidProductionRecord` — this function never
 * writes anything itself.
 */
export function voidProductionRecord(
  params: VoidProductionRecordParams,
): Result<ProductionRecord, DomainError> {
  const correctionIdResult = parseProductionCorrectionId(
    (params.generateCorrectionId ?? generateProductionCorrectionId)(),
  )
  if (!correctionIdResult.ok) {
    return correctionIdResult
  }

  return applyVoidRecord(params.record, {
    correctionId: correctionIdResult.value,
    reason: params.reason,
    correctedAt: params.correctedAt,
    correctedBy: params.correctedBy,
  })
}
