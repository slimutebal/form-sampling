import type { EmployeeId } from '../common/identifiers'
import type { DeliveryDestinationCode } from './delivery-destination'

/**
 * A sample's delivery state (BR-DELIVERY-001/002/003). Discriminated
 * union so the contradictory state — a destination or dispatcher present
 * while NOT_PICKED_UP — is impossible to construct (mirrors
 * SamplingEvaluation's discriminated shape in
 * `@/domain/sampling/sampling-engine`). Dispatcher is deliberately
 * optional even when DELIVERED ("can have Dispatcher NIK", not "must").
 * No pickup/delivery timestamp, vehicle, receiver, or signature is
 * modeled — none of these are confirmed requirements (docs/ROADMAP.md
 * Phase 11 §8).
 */
export type SampleDelivery =
  | { readonly status: 'NOT_PICKED_UP' }
  | {
      readonly status: 'DELIVERED'
      readonly destination: DeliveryDestinationCode
      readonly dispatcherEmployeeId?: EmployeeId
    }

export function createNotPickedUpDelivery(): SampleDelivery {
  return { status: 'NOT_PICKED_UP' }
}

export function createDeliveredDelivery(
  destination: DeliveryDestinationCode,
  dispatcherEmployeeId?: EmployeeId,
): SampleDelivery {
  return dispatcherEmployeeId === undefined
    ? { status: 'DELIVERED', destination }
    : { status: 'DELIVERED', destination, dispatcherEmployeeId }
}
