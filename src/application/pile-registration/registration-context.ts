import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import type { PileId } from '@/domain/common/identifiers'

export function registrationKey(pileId: PileId, batch: number): string {
  return `${pileId}:${batch}`
}

export function activeRegistrationsForPile(
  registrations: readonly PileRegistrationDraft[],
  pileId: PileId,
): readonly PileRegistrationDraft[] {
  return registrations
    .filter((registration) => registration.pileId === pileId && registration.status === 'ACTIVE')
    .sort((left, right) => Number(left.batch) - Number(right.batch) || Number(left.rit) - Number(right.rit))
}

export function hasDuplicateRegistration(
  registrations: readonly PileRegistrationDraft[],
  pileId: PileId,
  batch: number,
): boolean {
  return registrations.some((registration) => registration.pileId === pileId && Number(registration.batch) === batch)
}
