import { createBaseFleetDefinition, type FleetExcaConfigurationRevision } from '@/domain/fleet/fleet-definition'
import { createFrontDefinition } from '@/domain/fleet/front'
import { validateFleetDestinationMaterials } from '@/domain/fleet/fleet-destination-material'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import { fleetActivationVersion, latestFleetConfiguration } from '@/domain/fleet/fleet-operational-state'
import { createFleetSetup, type FleetSetup } from '@/domain/fleet/fleet-setup'
import type { MasterData } from '@/domain/master/master-data'
import type { Result, DomainError } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { parsePileId, parseTruckId } from '@/domain/common/identifiers'
import type { ExcaCode } from '@/domain/fleet/exca-code'

export interface ReactivateFleetParams {
  readonly fleetSetup: FleetSetup
  readonly masterData: MasterData
  readonly fleetId: string
  readonly sourceFleetId?: string
  readonly truckIds: readonly string[]
  readonly destinationPileIds: readonly string[]
  readonly excaCode: ExcaCode
  readonly commandId: string
  readonly actorId: string
  readonly effectiveAt: Date
  readonly expectedTargetVersion: number
  readonly expectedSourceVersion?: number
}

/**
 * Appends temporal activation/configuration history while retaining the Fleet
 * assignment identity and its legacy reference graph. The graph remains
 * historical provenance only; operational status comes from the new events.
 */
export function reactivateFleet(params: ReactivateFleetParams): Result<{ readonly fleetSetup: FleetSetup }, DomainError> {
  const target = params.fleetSetup.fleets.find((fleet) => fleet.fleetId === params.fleetId)
  const targetFront = target && params.fleetSetup.fronts.find((front) => front.frontId === target.frontId)
  if (!target || !targetFront) return err({ code: 'FLEET_NOT_FOUND', message: `Fleet ${params.fleetId} does not exist` })
  const lineage = deriveFrontLineage(params.fleetSetup)
  if (lineage.activeFrontIds.includes(targetFront.frontId)) return err({ code: 'FLEET_ALREADY_ACTIVE', message: `Fleet ${params.fleetId} is already active` })
  const state = params.fleetSetup.operationalState ?? { activationEvents: [], configurationRevisions: [], formationTransferEvents: [] }
  const existingCommand = state.activationEvents.some((event) => event.commandId === params.commandId)
  if (existingCommand) return ok({ fleetSetup: params.fleetSetup })
  const targetVersion = fleetActivationVersion(state, target.fleetId)
  if (targetVersion !== params.expectedTargetVersion) return err({ code: 'FLEET_VERSION_STALE', message: `Fleet ${params.fleetId} changed before reactivation` })
  const source = params.sourceFleetId ? params.fleetSetup.fleets.find((fleet) => fleet.fleetId === params.sourceFleetId) : undefined
  const sourceFront = source && params.fleetSetup.fronts.find((front) => front.frontId === source.frontId)
  if (params.sourceFleetId && (!source || !sourceFront)) return err({ code: 'FLEET_REFERENCE_NOT_FOUND', message: 'Selected Fleet Reference no longer exists' })
  if (source && source.fleetId === target.fleetId) return err({ code: 'FLEET_REFERENCE_SELF', message: 'Fleet cannot reference itself during reactivation' })
  if (source && (!lineage.activeFrontIds.includes(source.frontId) || sourceFront?.haulerCode !== targetFront.haulerCode)) return err({ code: 'FLEET_REFERENCE_NOT_ELIGIBLE', message: 'Selected Fleet Reference is no longer active and compatible' })
  if (source && params.expectedSourceVersion !== fleetActivationVersion(state, source.fleetId)) return err({ code: 'FLEET_VERSION_STALE', message: `Source Fleet ${source.fleetId} changed before transfer` })
  const trucks = params.truckIds.map(parseTruckId)
  const piles = params.destinationPileIds.map(parsePileId)
  if (trucks.some((result) => !result.ok) || trucks.length === 0 || new Set(params.truckIds).size !== params.truckIds.length) return err({ code: 'FLEET_TRUCK_POOL_INVALID', message: 'Fleet requires one or more unique Truck IDs' })
  if (piles.some((result) => !result.ok) || piles.length === 0) return err({ code: 'FLEET_MINIMUM_PILE_REQUIRED', message: 'Fleet requires one or more unique Piles' })
  if (new Set(params.destinationPileIds.map((pileId) => pileId.trim())).size !== params.destinationPileIds.length) return err({ code: 'FLEET_DESTINATION_DUPLICATE', message: 'A Fleet cannot contain the same destination Pile more than once' })
  const truckIds = trucks.flatMap((result) => result.ok ? [result.value] : [])
  const pileIds = piles.flatMap((result) => result.ok ? [result.value] : [])
  const materialValidation = validateFleetDestinationMaterials(params.masterData, pileIds.map(String))
  if (!materialValidation.ok) return materialValidation
  const recordedAt = new Date()
  const revisionId = crypto.randomUUID()
  const targetNextVersion = targetVersion + 1
  const sourceNextVersion = source ? fleetActivationVersion(state, source.fleetId) + 1 : undefined
  const revisedFront = createFrontDefinition(targetFront.frontId, targetFront.sectorCode, targetFront.haulerCode, pileIds[0], params.excaCode, pileIds)
  const excaRevision: FleetExcaConfigurationRevision | undefined = targetFront.excaCode !== params.excaCode ? { revisionId, fleetAssignmentId: target.fleetId, previousExcaCode: targetFront.excaCode, excaCode: params.excaCode, effectiveAt: params.effectiveAt, recordedAt, actorId: params.actorId, reason: 'REACTIVATED' } : undefined
  const revisedFleet = createBaseFleetDefinition({ fleetId: target.fleetId, frontId: target.frontId, truckIds, assignmentIdentity: target.assignmentIdentity, excaConfigurationHistory: [...(target.excaConfigurationHistory ?? []), ...(excaRevision ? [excaRevision] : [])] })
  if (!revisedFleet.ok) return revisedFleet
  const targetActivation = { eventId: crypto.randomUUID(), commandId: params.commandId, fleetAssignmentId: target.fleetId, action: 'REACTIVATE' as const, effectiveAt: params.effectiveAt, recordedAt, actorId: params.actorId, version: targetNextVersion }
  const sourceDeactivation = source ? { eventId: crypto.randomUUID(), commandId: params.commandId, fleetAssignmentId: source.fleetId, action: 'DEACTIVATE' as const, effectiveAt: params.effectiveAt, recordedAt, actorId: params.actorId, version: sourceNextVersion! } : undefined
  const configuration = { revisionId, commandId: params.commandId, fleetAssignmentId: target.fleetId, excaCode: params.excaCode as string, truckIds, destinationPileIds: pileIds, effectiveAt: params.effectiveAt, recordedAt, actorId: params.actorId, version: targetNextVersion }
  const transfer = source ? { eventId: crypto.randomUUID(), commandId: params.commandId, sourceFleetAssignmentId: source.fleetId, targetFleetAssignmentId: target.fleetId, sourceConfigurationRevisionId: latestFleetConfiguration(state, source.fleetId)?.revisionId, resultingTargetConfigurationRevisionId: revisionId, effectiveAt: params.effectiveAt, recordedAt, actorId: params.actorId, version: targetNextVersion } : undefined
  const rebuilt = createFleetSetup({ fronts: params.fleetSetup.fronts.map((front) => front.frontId === targetFront.frontId ? revisedFront : front), fleets: params.fleetSetup.fleets.map((fleet) => fleet.fleetId === target.fleetId ? revisedFleet.value : fleet), operationalState: { activationEvents: [...state.activationEvents, ...(sourceDeactivation ? [sourceDeactivation] : []), targetActivation], configurationRevisions: [...state.configurationRevisions, configuration], formationTransferEvents: [...state.formationTransferEvents, ...(transfer ? [transfer] : [])] } }, params.masterData)
  if (!rebuilt.ok) return err(rebuilt.error)
  return ok({ fleetSetup: rebuilt.value })
}
