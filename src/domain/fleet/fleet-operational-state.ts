import type { FleetId, PileId, TruckId } from '../common/identifiers'

/**
 * Append-only operational history stored with a FleetSetup snapshot.
 * Legacy snapshots intentionally omit this field and continue to use the
 * reference-lineage projection until their first operational event.
 */
export interface FleetActivationEvent {
  readonly eventId: string
  readonly commandId: string
  readonly fleetAssignmentId: FleetId
  readonly action: 'ACTIVATE' | 'DEACTIVATE' | 'REACTIVATE'
  readonly effectiveAt: Date
  readonly recordedAt: Date
  readonly actorId: string
  readonly version: number
}

export interface FleetFormationConfigurationRevision {
  readonly revisionId: string
  readonly commandId: string
  readonly fleetAssignmentId: FleetId
  readonly excaCode?: string
  readonly truckIds: readonly TruckId[]
  readonly destinationPileIds: readonly PileId[]
  readonly effectiveAt: Date
  readonly recordedAt: Date
  readonly actorId: string
  readonly version: number
}

export interface FleetFormationTransferEvent {
  readonly eventId: string
  readonly commandId: string
  readonly sourceFleetAssignmentId: FleetId
  readonly targetFleetAssignmentId: FleetId
  readonly sourceConfigurationRevisionId?: string
  readonly resultingTargetConfigurationRevisionId: string
  readonly effectiveAt: Date
  readonly recordedAt: Date
  readonly actorId: string
  readonly version: number
}

export interface FleetOperationalState {
  readonly activationEvents: readonly FleetActivationEvent[]
  readonly configurationRevisions: readonly FleetFormationConfigurationRevision[]
  readonly formationTransferEvents: readonly FleetFormationTransferEvent[]
}

export function latestFleetActivation(state: FleetOperationalState | undefined, fleetId: FleetId): FleetActivationEvent | undefined {
  return state?.activationEvents
    .filter((event) => event.fleetAssignmentId === fleetId)
    .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.version - right.version)
    .at(-1)
}

/** `undefined` means no temporal event: callers must retain legacy behavior. */
export function temporalFleetActive(state: FleetOperationalState | undefined, fleetId: FleetId): boolean | undefined {
  const latest = latestFleetActivation(state, fleetId)
  return latest ? latest.action !== 'DEACTIVATE' : undefined
}

export function fleetActivationVersion(state: FleetOperationalState | undefined, fleetId: FleetId): number {
  return latestFleetActivation(state, fleetId)?.version ?? 0
}

export function latestFleetConfiguration(state: FleetOperationalState | undefined, fleetId: FleetId): FleetFormationConfigurationRevision | undefined {
  return state?.configurationRevisions
    .filter((revision) => revision.fleetAssignmentId === fleetId)
    .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.version - right.version)
    .at(-1)
}
