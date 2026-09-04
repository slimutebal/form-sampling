import type { Brand } from '../common/brand'
import type { BatchNumber } from '../batch/batch-number'
import type { RitNumber } from '../batch/rit-number'
import type { OreCode } from '../common/codes'
import type { PileId, SamplePositionId, ShiftId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { findEmployee, findOreSamplingConfig, type MasterData } from '../master/master-data'
import type { Pile } from '../pile/pile'
import type { SampleDelivery } from './delivery-status'
import { buildSampleRange } from './sample-range'
import { calculateTotalBag, type TotalBag } from './total-bag'

/**
 * Raw shape of one Sample Position operational record. Any caller can
 * construct this shape directly — it makes no promise that Ore config
 * lookup, sample range generation, Total Bag calculation, or Dispatcher
 * validation actually ran. Use this only as the internal building block
 * of createSamplePosition(); do not treat it as a validated position.
 */
export interface SamplePositionData {
  readonly id: SamplePositionId
  readonly shiftId: ShiftId
  readonly pileId: PileId
  readonly oreCode: OreCode
  readonly batchNumber: BatchNumber
  readonly ritFrom: RitNumber
  readonly ritTo: RitNumber
  readonly sampledRitNumbers: readonly RitNumber[]
  readonly totalBag: TotalBag
  readonly delivery: SampleDelivery
}

/**
 * A validated, immutable Sample Position (BR-SP-001/002/003,
 * ARCHITECTURE.md §5.6). Branded (nominal, no runtime field) so a raw
 * SamplePositionData-shaped object cannot be assigned directly as a
 * SamplePosition — the only way to obtain one is
 * createSamplePosition(), which guarantees:
 *  - OreCode was derived from the given Pile, never accepted as caller
 *    input (BR-SP-002);
 *  - the Ore's sampling configuration was actually looked up;
 *  - the sampled Rit sequence and Total Bag were computed by the Phase
 *    11 range/bag engines, never manually supplied (docs/ROADMAP.md
 *    Phase 11 §14);
 *  - a supplied Dispatcher EmployeeId was checked against the employee
 *    master (BR-DELIVERY-003).
 * This position intentionally carries no overlap-checked guarantee —
 * overlap validation is a separate, store-atomic concern
 * (`./sample-overlap`, infrastructure `addSamplePosition`) — and no
 * edit/void/correction metadata (correction policy is
 * NEEDS_CONFIRMATION, BUSINESS_RULES.md §28).
 */
export type SamplePosition = Brand<SamplePositionData, 'SamplePosition'>

export interface CreateSamplePositionParams {
  readonly id: SamplePositionId
  readonly shiftId: ShiftId
  readonly pile: Pile
  readonly batchNumber: BatchNumber
  readonly ritFrom: RitNumber
  readonly ritTo: RitNumber
  readonly masterData: MasterData
  readonly delivery: SampleDelivery
}

/**
 * Creates one immutable SamplePosition from validated domain context.
 * Validation order:
 *  1. Ore config lookup (Pile.oreCode -> OreSamplingConfig,
 *     BR-MASTER-002) — ORE_SAMPLING_CONFIG_NOT_FOUND if none exists.
 *  2. Sample range generation from ritFrom/ritTo against that config's
 *     SamplingInterval/BatchSize (`buildSampleRange`) — propagates
 *     SAMPLE_RANGE_REVERSED / SAMPLE_RANGE_EXCEEDS_BATCH_SIZE /
 *     SAMPLE_RANGE_HAS_NO_SAMPLE_POSITION unchanged.
 *  3. If delivery is DELIVERED with a dispatcherEmployeeId, that
 *     EmployeeId is looked up in MasterData — DISPATCHER_NOT_FOUND if
 *     unknown (BR-DELIVERY-003). A DELIVERED without a dispatcher is
 *     valid (dispatcher is optional even when delivered).
 *  4. Total Bag is calculated from the generated sampled Rit count and
 *     the Ore config's SamplingInterval/Packing (`calculateTotalBag`) —
 *     never accepted as caller input. Propagates
 *     INVALID_SAMPLED_RIT_COUNT / TOTAL_BAG_NOT_FINITE /
 *     TOTAL_BAG_NOT_POSITIVE unchanged.
 * Never invents an interpretation for PackingConfigValue beyond the
 * current calculation (BUSINESS_RULES.md §27) and never checks overlap
 * against other positions (see module doc on SamplePosition).
 */
export function createSamplePosition(params: CreateSamplePositionParams): Result<SamplePosition, DomainError> {
  const oreSamplingConfig = findOreSamplingConfig(params.masterData, params.pile.oreCode)
  if (!oreSamplingConfig) {
    return err({
      code: 'ORE_SAMPLING_CONFIG_NOT_FOUND',
      message: `No OreSamplingConfig exists for OreCode ${params.pile.oreCode}`,
    })
  }

  const range = buildSampleRange({
    ritFrom: params.ritFrom,
    ritTo: params.ritTo,
    interval: oreSamplingConfig.interval,
    batchSize: oreSamplingConfig.batchSize,
  })
  if (!range.ok) {
    return range
  }

  if (params.delivery.status === 'DELIVERED' && params.delivery.dispatcherEmployeeId !== undefined) {
    const employee = findEmployee(params.masterData, params.delivery.dispatcherEmployeeId)
    if (!employee) {
      return err({
        code: 'DISPATCHER_NOT_FOUND',
        message: `No employee exists for EmployeeId ${params.delivery.dispatcherEmployeeId}`,
      })
    }
  }

  const totalBag = calculateTotalBag(
    range.value.sampledRitNumbers.length,
    oreSamplingConfig.interval,
    oreSamplingConfig.packing,
  )
  if (!totalBag.ok) {
    return totalBag
  }

  const data: SamplePositionData = {
    id: params.id,
    shiftId: params.shiftId,
    pileId: params.pile.id,
    oreCode: params.pile.oreCode,
    batchNumber: params.batchNumber,
    ritFrom: range.value.ritFrom,
    ritTo: range.value.ritTo,
    sampledRitNumbers: range.value.sampledRitNumbers,
    totalBag: totalBag.value,
    delivery: params.delivery,
  }
  return ok(data as SamplePosition)
}
