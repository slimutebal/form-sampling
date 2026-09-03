import type { Brand } from '../common/brand'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { FleetId, FrontId, HaulageTransactionId, PileId, ShiftId, TruckId } from '../common/identifiers'
import type { BatchPosition } from '../batch/batch-position'
import { createBatchPosition, validateBatchPosition } from '../batch/batch-position'
import { resolveEffectiveFleetAgainstMaster } from '../fleet/fleet-resolution'
import type { FleetSetup } from '../fleet/fleet-setup'
import type { TruckValidationResult } from '../fleet/truck-validation'
import { validateTruckForFleet } from '../fleet/truck-validation'
import { findOreSamplingConfig, type MasterData } from '../master/master-data'
import type { Pile } from '../pile/pile'
import type { SamplingEvaluation } from '../sampling/sampling-engine'
import { evaluateSampling } from '../sampling/sampling-engine'

/**
 * Raw shape of one recorded haulage operational decision. Any caller
 * can construct this shape directly — it makes no promise that Ore
 * config lookup, BatchPosition validation, fleet/truck validation, or
 * sampling evaluation actually ran. Use this only as the internal
 * building block of createHaulageTransaction(); do not treat it as a
 * validated transaction.
 */
export interface HaulageTransactionData {
  readonly id: HaulageTransactionId
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly batchPosition: BatchPosition
  readonly frontId: FrontId
  readonly fleetId: FleetId
  readonly truckId: TruckId
  readonly samplingEvaluation: SamplingEvaluation
  readonly truckValidation: TruckValidationResult
}

/**
 * A validated, immutable haulage transaction (BR-SHIFT-001, BR-TRUCK-003,
 * ARCHITECTURE.md §5.3). Branded (nominal, no runtime field) so a raw
 * HaulageTransactionData-shaped object cannot be assigned directly as a
 * HaulageTransaction — the only way to obtain one is
 * createHaulageTransaction(), which guarantees:
 *  - the Ore's sampling configuration was actually looked up;
 *  - BatchPosition was validated against that configuration's BatchSize;
 *  - FrontId was derived from the selected Fleet, never supplied
 *    independently and never able to contradict it;
 *  - the selected Truck was classified by the Phase 5 engine — VALID or
 *    WRONG_TRUCK — and that classification is retained as a snapshot
 *    (BR-TRUCK-003), not recomputed later by reporting;
 *  - SamplingEvaluation was computed by the Phase 4 engine from the
 *    validated BatchPosition, never manually overridden (BR-SAMPLE-002).
 * This transaction intentionally carries no Wrong Truck blocking/approval
 * field, no timestamp, and no correction/void metadata — all of these
 * are NEEDS_CONFIRMATION or later-phase concerns (BUSINESS_RULES.md §28,
 * §29).
 */
export type HaulageTransaction = Brand<HaulageTransactionData, 'HaulageTransaction'>

export interface CreateHaulageTransactionParams {
  readonly id: HaulageTransactionId
  readonly shiftId: ShiftId
  readonly pile: Pile
  readonly batchPosition: BatchPosition
  readonly fleetId: FleetId
  readonly truckId: TruckId
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
}

/**
 * Creates one immutable HaulageTransaction from validated domain
 * context. Validation order:
 *  1. Ore config lookup (Pile.oreCode → OreSamplingConfig, BR-MASTER-002)
 *     — ORE_SAMPLING_CONFIG_NOT_FOUND if none exists. No default
 *     interval/batch size is invented.
 *  2. BatchPosition validated against that config's BatchSize
 *     (RIT_EXCEEDS_BATCH_SIZE).
 *  3. The selected Fleet's effective membership is resolved and
 *     validated against MasterData (fleet-resolution.ts) — an
 *     inconsistent fleet context (unknown FleetId, an effective member
 *     unknown to master data, or a hauler-mismatched effective member)
 *     fails transaction creation outright rather than being downgraded
 *     into an ordinary Wrong Truck.
 *  4. The selected Truck is classified against that Fleet
 *     (truck-validation.ts) — an unknown selected Truck fails with
 *     TRUCK_NOT_FOUND_IN_MASTER; a known truck outside the effective
 *     fleet/hauler still succeeds, classified WRONG_TRUCK, and is
 *     retained rather than discarded or substituted (BR-TRUCK-003).
 *  5. SamplingEvaluation is computed from the validated BatchPosition's
 *     RitNumber and the Ore config's SamplingInterval (BR-SAMPLE-001) —
 *     never accepted as caller input (BR-SAMPLE-002).
 * Never uses OreSamplingConfig.packing (packing semantics are
 * NEEDS_CONFIRMATION, BUSINESS_RULES.md §27) and never decides Wrong
 * Truck blocking/approval policy (BUSINESS_RULES.md §29).
 */
export function createHaulageTransaction(
  params: CreateHaulageTransactionParams,
): Result<HaulageTransaction, DomainError> {
  const oreSamplingConfig = findOreSamplingConfig(params.masterData, params.pile.oreCode)
  if (!oreSamplingConfig) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${params.pile.oreCode}`,
    })
  }

  const validatedPosition = validateBatchPosition(params.batchPosition, oreSamplingConfig.batchSize)
  if (!validatedPosition.ok) {
    return validatedPosition
  }

  const effectiveFleet = resolveEffectiveFleetAgainstMaster(params.masterData, params.fleetSetup, params.fleetId)
  if (!effectiveFleet.ok) {
    return effectiveFleet
  }

  const truckValidation = validateTruckForFleet(params.masterData, params.fleetSetup, params.fleetId, params.truckId)
  if (!truckValidation.ok) {
    return truckValidation
  }

  const samplingEvaluation = evaluateSampling(validatedPosition.value.ritNumber, oreSamplingConfig.interval)

  const data: HaulageTransactionData = {
    id: params.id,
    shiftId: params.shiftId,
    pileId: params.pile.id,
    batchPosition: createBatchPosition(validatedPosition.value.batchNumber, validatedPosition.value.ritNumber),
    frontId: effectiveFleet.value.frontId,
    fleetId: params.fleetId,
    truckId: params.truckId,
    samplingEvaluation,
    truckValidation: truckValidation.value,
  }
  return ok(data as HaulageTransaction)
}

/**
 * Detects a repeated HaulageTransactionId within a collection
 * (ARCHITECTURE.md §10 — the new Transaction_ID must be unique, unlike
 * the legacy Date/Shift|Front identification it replaces). Deliberately
 * does not infer anything about two different transaction IDs that
 * happen to share the same BatchPosition — correction/audit policy for
 * that case is NEEDS_CONFIRMATION (BUSINESS_RULES.md §28) and is not
 * decided here.
 */
export function validateNoDuplicateHaulageTransactionIds(
  transactions: readonly HaulageTransaction[],
): Result<readonly HaulageTransaction[], DomainError> {
  const seen = new Set<HaulageTransactionId>()
  for (const transaction of transactions) {
    if (seen.has(transaction.id)) {
      return err({
        code: 'DUPLICATE_HAULAGE_TRANSACTION_ID',
        message: `Duplicate HaulageTransactionId: ${transaction.id}`,
      })
    }
    seen.add(transaction.id)
  }
  return ok(transactions)
}
