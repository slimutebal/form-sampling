import type { Brand } from '../common/brand'
import { createNonBlankStringParser } from '../common/validators'

/**
 * Stable, language-neutral delivery destination value (BR-DELIVERY-002,
 * "Deliver To"). No authoritative destination master collection is
 * currently confirmed in MasterData (docs/BUSINESS_RULES.md — Deliver
 * To source is unresolved) — this type only validates that a
 * non-blank code was supplied. The catalog of selectable destinations
 * is an explicit caller/application-owned input
 * (`@/application/sample-handling/delivery-destination`), never an
 * assumed MasterData collection.
 */
export type DeliveryDestinationCode = Brand<string, 'DeliveryDestinationCode'>

export const parseDeliveryDestinationCode = createNonBlankStringParser(
  'DeliveryDestinationCode',
  'BLANK_DELIVERY_DESTINATION_CODE',
)
