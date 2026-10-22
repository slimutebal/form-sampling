import { adjustFrontFleet } from '@/application/fleet-setup/adjust-front-fleet'
import { parsePileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { ExcaCode } from '@/domain/fleet/exca-code'
import type { FleetExcaConfigurationRevision } from '@/domain/fleet/fleet-definition'
import { createFrontDefinition } from '@/domain/fleet/front'
import { validateFleetDestinationMaterials } from '@/domain/fleet/fleet-destination-material'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import type { MasterData } from '@/domain/master/master-data'

export interface ReconfigureActiveFrontFleetParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  readonly frontId: string
  /** Complete desired Pile set. The first Pile remains the legacy primary. */
  readonly destinationPileIds: readonly string[]
  readonly excaCode: ExcaCode
  readonly truckIds: readonly string[]
  readonly excaRevision?: FleetExcaConfigurationRevision
}

/**
 * Rebuilds only an unused active Front's current configuration. Front/Fleet
 * identity and DERIVED lineage stay intact; the store's production guard is
 * responsible for refusing this candidate once any history exists.
 */
export function reconfigureActiveFrontFleet(
  params: ReconfigureActiveFrontFleetParams,
): Result<{ readonly fleetSetup: FleetSetup }, DomainError> {
  const adjusted = adjustFrontFleet({
    fleetSetup: params.fleetSetup,
    masterData: params.masterData,
    frontId: params.frontId,
    truckIds: params.truckIds,
  })
  if (!adjusted.ok) return adjusted

  const currentFront = adjusted.value.fleetSetup.fronts.find((front) => front.frontId === params.frontId)
  if (!currentFront) {
    return err({ code: 'FRONT_NOT_FOUND', message: `Front ${params.frontId} does not exist in this shift's fleet setup` })
  }
  if (params.destinationPileIds.length === 0) {
    return err({ code: 'FLEET_MINIMUM_PILE_REQUIRED', message: 'An active Fleet must retain at least one Pile' })
  }
  if (new Set(params.destinationPileIds.map((pileId) => pileId.trim())).size !== params.destinationPileIds.length) {
    return err({ code: 'FLEET_DESTINATION_DUPLICATE', message: 'A Fleet cannot contain the same destination Pile more than once' })
  }
  const parsedDestinations = params.destinationPileIds.map(parsePileId)
  const invalidDestination = parsedDestinations.find((result) => !result.ok)
  if (invalidDestination && !invalidDestination.ok) return invalidDestination
  const destinationPileIds = [...new Set(parsedDestinations.map((result) => result.ok ? result.value : undefined).filter((pileId): pileId is NonNullable<typeof pileId> => Boolean(pileId)))]
  if (destinationPileIds.length === 0) {
    return err({ code: 'FLEET_MINIMUM_PILE_REQUIRED', message: 'An active Fleet must retain at least one Pile' })
  }
  const materialValidation = validateFleetDestinationMaterials(params.masterData, destinationPileIds.map(String))
  if (!materialValidation.ok) return materialValidation

  const updatedFront = createFrontDefinition(
    currentFront.frontId,
    currentFront.sectorCode,
    currentFront.haulerCode,
    destinationPileIds[0],
    params.excaCode,
    destinationPileIds,
  )
  const rebuilt = createFleetSetup(
    {
      fronts: adjusted.value.fleetSetup.fronts.map((front) => front.frontId === updatedFront.frontId ? updatedFront : front),
      fleets: adjusted.value.fleetSetup.fleets.map((fleet) => {
        if (fleet.frontId !== currentFront.frontId || currentFront.excaCode === params.excaCode || !params.excaRevision) return fleet
        return { ...fleet, excaConfigurationHistory: [...(fleet.excaConfigurationHistory ?? []), params.excaRevision] }
      }),
      ...(adjusted.value.fleetSetup.operationalState ? { operationalState: adjusted.value.fleetSetup.operationalState } : {}),
    },
    params.masterData,
  )
  if (!rebuilt.ok) return rebuilt
  return ok({ fleetSetup: rebuilt.value })
}
