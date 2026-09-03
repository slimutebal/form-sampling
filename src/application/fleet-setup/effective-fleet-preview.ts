import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { parseHaulerCode } from '@/domain/master/master-codes'
import type { Shift } from '@/domain/shift/shift'
import { findTrucksForHauler } from '@/domain/fleet/truck-validation'

export function previewEffectiveFleet(
  entries: readonly FleetSetupDraftEntry[],
  shift: Shift,
  masterData: MasterData,
  fleetId: string,
): Result<readonly string[]> {
  const validated = createFleetSetupFromDraft(entries, shift, masterData)
  if (!validated.ok) return validated
  const effective = validated.value.effectiveFleets.find((fleet) => fleet.fleetId === fleetId)
  if (!effective) {
    return err<DomainError>({
      code: 'FLEET_NOT_FOUND',
      message: 'Fleet preview target was not found',
    })
  }
  return ok([...effective.truckIds])
}

export function truckOptionsForHauler(
  masterData: MasterData,
  haulerCode: string,
): readonly string[] {
  const parsed = parseHaulerCode(haulerCode)
  if (!parsed.ok) return []
  return findTrucksForHauler(masterData, parsed.value).map((truck) => truck.id)
}

export function availableAddedTruckIds(
  masterData: MasterData,
  haulerCode: string,
  inheritedTruckIds: readonly string[],
  addedTruckIds: readonly string[],
  removedTruckIds: readonly string[],
): readonly string[] {
  const excluded = new Set([...inheritedTruckIds, ...addedTruckIds, ...removedTruckIds])
  return truckOptionsForHauler(masterData, haulerCode).filter((truckId) => !excluded.has(truckId))
}
