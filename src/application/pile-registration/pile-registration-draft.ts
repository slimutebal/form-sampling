import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { OreCode } from '@/domain/common/codes'
import type { PileId } from '@/domain/common/identifiers'
import { createPile, type Pile } from '@/domain/pile/pile'

/** A pre-shift operational registration. It is deliberately separate from Pile identity. */
export type PileRegistrationStatus = 'ACTIVE' | 'INACTIVE'

export interface PileRegistrationDraft {
  readonly pileId: PileId
  readonly oreCode: OreCode
  readonly batch: BatchNumber
  readonly rit: RitNumber
  readonly status: PileRegistrationStatus
  /**
   * Physical bags/material observed by the sampling crew. This is entered
   * during Sample Setup and is deliberately independent of logical sample
   * progress or delivery calculation.
   */
  readonly sampleInHouse?: number
  /**
   * Set only when this registration was chosen as the continuation of a
   * completed batch. It is optional so stored registrations from before the
   * continuation workflow remain valid.
   */
  readonly continuationFromBatch?: BatchNumber
}

/**
 * Projects registrations onto the unique operational Pile identities used by
 * Fleet Setup and the workspace. Inactive rows stay in the registration
 * history, but must not become a destination or new-production pile.
 */
export function deriveActiveRegistrationPiles(
  registrations: readonly PileRegistrationDraft[],
): readonly Pile[] {
  const piles = new Map<PileId, Pile>()
  for (const registration of registrations) {
    if (registration.status === 'ACTIVE' && !piles.has(registration.pileId)) {
      piles.set(registration.pileId, createPile(registration.pileId, registration.oreCode))
    }
  }
  return [...piles.values()]
}

export function activeRegistrationPileIds(
  registrations: readonly PileRegistrationDraft[],
): readonly PileId[] {
  return deriveActiveRegistrationPiles(registrations).map((pile) => pile.id)
}
