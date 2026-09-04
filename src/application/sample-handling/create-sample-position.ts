import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseEmployeeId, parseSamplePositionId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery, type SampleDelivery } from '@/domain/sample-handling/delivery-status'
import { createSamplePosition, type SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'

/**
 * Raw UI delivery draft: NOT_PICKED_UP carries nothing; DELIVERED carries
 * raw (unparsed) destination/dispatcher strings — the dispatcher is
 * optional even when delivered (BR-DELIVERY-003).
 */
export type SamplePositionDeliveryDraft =
  | { readonly status: 'NOT_PICKED_UP' }
  | { readonly status: 'DELIVERED'; readonly destination: string; readonly dispatcherEmployeeId?: string }

export interface CreateSamplePositionParams {
  readonly generatedSamplePositionId: string
  readonly shift: Shift
  readonly pile: Pile
  readonly batchNumber: number
  readonly ritFrom: number
  readonly ritTo: number
  readonly masterData: MasterData
  readonly delivery: SamplePositionDeliveryDraft
}

/**
 * Normal-workflow Sample Position creation orchestration
 * (docs/ROADMAP.md Phase 11 §14/§25). Parses the raw UI-supplied
 * id/Batch/Rit/delivery strings, then delegates every business
 * calculation (Ore derivation, sample range generation, Total Bag,
 * Dispatcher validation) to `createSamplePosition` (domain) — this
 * function never constructs a raw SamplePosition object itself and never
 * checks overlap (a separate, store-atomic concern — see
 * `@/domain/sample-handling/sample-overlap`).
 */
export function recordSamplePosition(params: CreateSamplePositionParams): Result<SamplePosition, DomainError> {
  const id = parseSamplePositionId(params.generatedSamplePositionId)
  if (!id.ok) {
    return id
  }
  const batchNumber = parseBatchNumber(params.batchNumber)
  if (!batchNumber.ok) {
    return batchNumber
  }
  const ritFrom = parseRitNumber(params.ritFrom)
  if (!ritFrom.ok) {
    return ritFrom
  }
  const ritTo = parseRitNumber(params.ritTo)
  if (!ritTo.ok) {
    return ritTo
  }

  let delivery: SampleDelivery
  if (params.delivery.status === 'NOT_PICKED_UP') {
    delivery = createNotPickedUpDelivery()
  } else {
    const destination = parseDeliveryDestinationCode(params.delivery.destination)
    if (!destination.ok) {
      return destination
    }
    if (params.delivery.dispatcherEmployeeId) {
      const dispatcherEmployeeId = parseEmployeeId(params.delivery.dispatcherEmployeeId)
      if (!dispatcherEmployeeId.ok) {
        return dispatcherEmployeeId
      }
      delivery = createDeliveredDelivery(destination.value, dispatcherEmployeeId.value)
    } else {
      delivery = createDeliveredDelivery(destination.value)
    }
  }

  return createSamplePosition({
    id: id.value,
    shiftId: params.shift.id,
    pile: params.pile,
    batchNumber: batchNumber.value,
    ritFrom: ritFrom.value,
    ritTo: ritTo.value,
    masterData: params.masterData,
    delivery,
  })
}
