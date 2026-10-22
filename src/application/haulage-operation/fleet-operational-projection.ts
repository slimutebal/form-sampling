import type { FleetId, FrontId, PileId, ShiftId, TruckId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import {
  createFleetOperationalLifecycleState,
  deriveLegacyFleetOperationalLifecycle,
  projectFleetOperationalLifecycle,
  validateLegacyProjectionEquivalence,
  type FleetAssignmentId,
  type FleetConfigurationRevisionId,
  type FleetLifecycleError,
  type FleetOperationalLifecycleState,
} from '@/domain/fleet/operational-lifecycle'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { ExcaCode } from '@/domain/fleet/exca-code'
import type { HaulerCode } from '@/domain/master/master-codes'
import type {
  FleetLifecyclePersistenceError,
  FleetLifecycleReadiness,
} from '@/infrastructure/local-db/fleet-lifecycle-repository'

/**
 * Read-only view for future operational selectors. It intentionally does not
 * replace `operationalFleetOptionsForPile()` while lifecycle persistence and
 * migration validation remain gated.
 */
export interface ActiveFleetOperationalProjection {
  readonly status: 'ACTIVE'
  readonly shiftWorkspaceId: ShiftId
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly company: HaulerCode
  readonly assignmentId: FleetAssignmentId
  readonly assignmentVersion: number
  readonly lineageRootFleetId: FleetId
  readonly activeDestinationPileIds: readonly PileId[]
  readonly configurationRevisionId: FleetConfigurationRevisionId
  readonly excaCode?: ExcaCode
  readonly sharedTruckIds: readonly TruckId[]
}

export interface HistoricalFleetOperationalProjection {
  readonly status: 'HISTORICAL'
  readonly shiftWorkspaceId: ShiftId
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly company: HaulerCode
  readonly assignmentId: FleetAssignmentId
  readonly assignmentVersion: number
  readonly lineageRootFleetId: FleetId
  readonly configurationRevisionIds: readonly FleetConfigurationRevisionId[]
}

export interface ReadyFleetOperationalProjection {
  readonly status: 'READY'
  readonly source: 'LIFECYCLE_VERIFIED' | 'LEGACY_FALLBACK'
  readonly activeFleets: readonly ActiveFleetOperationalProjection[]
  readonly historicalAssignments: readonly HistoricalFleetOperationalProjection[]
}

export type FleetLifecycleProjectionUnavailableReason =
  | 'MIGRATION_INCOMPLETE'
  | 'MIGRATION_INCOMPATIBLE'
  | 'MIGRATION_UNRESOLVED'
  | 'MIGRATION_SOURCE_CHANGED'
  | 'PROJECTION_EQUIVALENCE_MISMATCH'
  | 'LIFECYCLE_STATE_INVALID'

export interface UnavailableFleetOperationalProjection {
  readonly status: 'UNAVAILABLE'
  readonly reason: FleetLifecycleProjectionUnavailableReason
  readonly message: string
  /** Existing read behavior remains explicitly available to a future caller. */
  readonly safeLegacyFallback?: ReadyFleetOperationalProjection
}

export type FleetOperationalProjection =
  | ReadyFleetOperationalProjection
  | UnavailableFleetOperationalProjection

export type FleetOperationalProjectionInput =
  | {
      readonly source: 'LIFECYCLE_VERIFIED'
      readonly lifecycleState: FleetOperationalLifecycleState
      /** Required when comparing a migrated legacy workspace before cutover. */
      readonly legacyFleetSetup?: FleetSetup
    }
  | {
      readonly source: 'LEGACY_FALLBACK'
      readonly shiftWorkspaceId: ShiftId
      readonly fleetSetup: FleetSetup
    }
  | {
      readonly source: 'LIFECYCLE_UNAVAILABLE'
      readonly reason: FleetLifecycleProjectionUnavailableReason
      readonly message: string
      readonly shiftWorkspaceId: ShiftId
      readonly legacyFleetSetup?: FleetSetup
    }

interface ProjectionError {
  readonly code: 'FLEET_LIFECYCLE_PROJECTION_INVALID' | 'FLEET_LIFECYCLE_PROJECTION_EQUIVALENCE_MISMATCH'
  readonly message: string
}

function projectionError(code: ProjectionError['code'], message: string): Result<never, ProjectionError> {
  return err({ code, message })
}

function readyProjection(
  state: FleetOperationalLifecycleState,
  source: ReadyFleetOperationalProjection['source'],
): Result<ReadyFleetOperationalProjection, ProjectionError> {
  const validated = createFleetOperationalLifecycleState(state)
  if (!validated.ok) return projectionError('FLEET_LIFECYCLE_PROJECTION_INVALID', validated.error.message)

  const identityByFleetId = new Map(validated.value.identities.map((identity) => [identity.fleetId, identity]))
  const projection = projectFleetOperationalLifecycle(validated.value)
  const activeFleets: ActiveFleetOperationalProjection[] = []
  const historicalAssignments: HistoricalFleetOperationalProjection[] = []

  for (const assignmentProjection of projection.assignments) {
    const { assignment, version, active, activeDestinations, effectiveConfiguration } = assignmentProjection
    const identity = identityByFleetId.get(assignment.fleetId)
    if (!identity) return projectionError('FLEET_LIFECYCLE_PROJECTION_INVALID', `Fleet identity is missing for ${assignment.fleetId}`)
    if (active) {
      if (!effectiveConfiguration) {
        return projectionError('FLEET_LIFECYCLE_PROJECTION_INVALID', `Active Fleet ${assignment.fleetId} has no effective configuration`)
      }
      activeFleets.push({
        status: 'ACTIVE',
        shiftWorkspaceId: assignment.shiftWorkspaceId,
        fleetId: assignment.fleetId,
        frontId: assignment.frontId,
        company: identity.haulerCode,
        assignmentId: assignment.assignmentId,
        assignmentVersion: version,
        lineageRootFleetId: assignment.lineageRootFleetId,
        activeDestinationPileIds: activeDestinations.map((destination) => destination.pileId),
        configurationRevisionId: effectiveConfiguration.revisionId,
        excaCode: effectiveConfiguration.excaCode,
        sharedTruckIds: effectiveConfiguration.truckIds,
      })
      continue
    }
    historicalAssignments.push({
      status: 'HISTORICAL',
      shiftWorkspaceId: assignment.shiftWorkspaceId,
      fleetId: assignment.fleetId,
      frontId: assignment.frontId,
      company: identity.haulerCode,
      assignmentId: assignment.assignmentId,
      assignmentVersion: version,
      lineageRootFleetId: assignment.lineageRootFleetId,
      configurationRevisionIds: validated.value.configurationRevisions
        .filter((revision) => revision.assignmentId === assignment.assignmentId)
        .sort((left, right) => left.revisionNumber - right.revisionNumber)
        .map((revision) => revision.revisionId),
    })
  }
  return ok({ status: 'READY', source, activeFleets, historicalAssignments })
}

function legacyProjection(shiftWorkspaceId: ShiftId, fleetSetup: FleetSetup): Result<ReadyFleetOperationalProjection, ProjectionError> {
  const lifecycle = deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId, fleetSetup })
  if (!lifecycle.ok) return projectionError('FLEET_LIFECYCLE_PROJECTION_INVALID', lifecycle.error.message)
  return readyProjection(lifecycle.value, 'LEGACY_FALLBACK')
}

function unavailable(
  reason: FleetLifecycleProjectionUnavailableReason,
  message: string,
  fallback?: ReadyFleetOperationalProjection,
): UnavailableFleetOperationalProjection {
  return fallback
    ? { status: 'UNAVAILABLE', reason, message, safeLegacyFallback: fallback }
    : { status: 'UNAVAILABLE', reason, message }
}

/**
 * Selects a projection source without touching IndexedDB, UI, or production
 * selectors. A caller must explicitly provide the repository/migration state.
 */
export function selectFleetOperationalProjection(input: FleetOperationalProjectionInput): FleetOperationalProjection {
  if (input.source === 'LEGACY_FALLBACK') {
    const legacy = legacyProjection(input.shiftWorkspaceId, input.fleetSetup)
    return legacy.ok
      ? legacy.value
      : unavailable('LIFECYCLE_STATE_INVALID', legacy.error.message)
  }

  if (input.source === 'LIFECYCLE_UNAVAILABLE') {
    const fallback = input.legacyFleetSetup
      ? legacyProjection(input.shiftWorkspaceId, input.legacyFleetSetup)
      : undefined
    return unavailable(
      input.reason,
      input.message,
      fallback?.ok ? fallback.value : undefined,
    )
  }

  const lifecycle = readyProjection(input.lifecycleState, 'LIFECYCLE_VERIFIED')
  if (!lifecycle.ok) return unavailable('LIFECYCLE_STATE_INVALID', lifecycle.error.message)
  if (!input.legacyFleetSetup) return lifecycle.value
  const shiftWorkspaceId = input.lifecycleState.identities[0]?.shiftWorkspaceId

  const equivalence = compareLegacyFleetProjection(
    shiftWorkspaceId,
    input.legacyFleetSetup,
    input.lifecycleState,
    lifecycle.value,
  )
  if (equivalence.ok) return lifecycle.value
  const fallback = shiftWorkspaceId
    ? legacyProjection(shiftWorkspaceId, input.legacyFleetSetup)
    : undefined
  const safeLegacyFallback = fallback && fallback.ok ? fallback.value : undefined
  return unavailable(
    'PROJECTION_EQUIVALENCE_MISMATCH',
    equivalence.error.message,
    safeLegacyFallback,
  )
}

/**
 * Bridges the Phase 1 repository's marker-aware read result to this pure
 * adapter. This is read-only and intentionally has no effect on active
 * production selectors.
 */
export function selectFleetOperationalProjectionFromReadiness(
  readiness: FleetLifecycleReadiness,
): FleetOperationalProjection {
  if (readiness.status === 'VERIFIED') {
    return selectFleetOperationalProjection({
      source: 'LIFECYCLE_VERIFIED',
      lifecycleState: readiness.lifecycleState,
      legacyFleetSetup: readiness.workspace.fleetSetup,
    })
  }
  if (readiness.status === 'NOT_MIGRATED') {
    return selectFleetOperationalProjection({
      source: 'LEGACY_FALLBACK',
      shiftWorkspaceId: readiness.workspace.shiftId,
      fleetSetup: readiness.workspace.fleetSetup,
    })
  }
  return selectFleetOperationalProjection({
    source: 'LIFECYCLE_UNAVAILABLE',
    reason: lifecycleProjectionUnavailableReason(readiness.error),
    message: readiness.error.message,
    shiftWorkspaceId: readiness.workspace.shiftId,
    legacyFleetSetup: readiness.workspace.fleetSetup,
  })
}

/** Compares a verified lifecycle view with the unchanged legacy FleetSetup. */
export function compareLegacyFleetProjection(
  shiftWorkspaceId: ShiftId | undefined,
  legacyFleetSetup: FleetSetup,
  lifecycleState: FleetOperationalLifecycleState,
  lifecycleProjection: ReadyFleetOperationalProjection,
): Result<void, ProjectionError> {
  if (!shiftWorkspaceId) return projectionError('FLEET_LIFECYCLE_PROJECTION_EQUIVALENCE_MISMATCH', 'Lifecycle state has no Shift Workspace identity')
  const equivalent = validateLegacyProjectionEquivalence(
    { shiftWorkspaceId, fleetSetup: legacyFleetSetup },
    lifecycleState,
  )
  if (!equivalent.ok) return projectionError('FLEET_LIFECYCLE_PROJECTION_EQUIVALENCE_MISMATCH', equivalent.error.message)
  const lifecycle = deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId, fleetSetup: legacyFleetSetup })
  if (!lifecycle.ok) return projectionError('FLEET_LIFECYCLE_PROJECTION_INVALID', lifecycle.error.message)
  const legacy = readyProjection(lifecycle.value, 'LEGACY_FALLBACK')
  if (!legacy.ok) return err(legacy.error)
  const normalizeActive = (items: readonly ActiveFleetOperationalProjection[]) => items
    .map((item) => `${item.fleetId}|${item.frontId}|${item.company}|${item.activeDestinationPileIds.join(',')}|${item.sharedTruckIds.join(',')}`)
    .sort()
  const normalizeHistorical = (items: readonly HistoricalFleetOperationalProjection[]) => items
    .map((item) => `${item.fleetId}|${item.frontId}|${item.company}`)
    .sort()
  if (
    normalizeActive(legacy.value.activeFleets).join(';') !== normalizeActive(lifecycleProjection.activeFleets).join(';')
    || normalizeHistorical(legacy.value.historicalAssignments).join(';') !== normalizeHistorical(lifecycleProjection.historicalAssignments).join(';')
  ) {
    return projectionError('FLEET_LIFECYCLE_PROJECTION_EQUIVALENCE_MISMATCH', 'Lifecycle and legacy Fleet projections differ')
  }
  return ok(undefined)
}

/** Maps Phase 1 persistence failures to the explicit Phase 2 read-only state. */
export function lifecycleProjectionUnavailableReason(error: FleetLifecyclePersistenceError | FleetLifecycleError): FleetLifecycleProjectionUnavailableReason {
  if (error.code === 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE') return 'MIGRATION_INCOMPLETE'
  if (error.code === 'FLEET_LIFECYCLE_MIGRATION_SOURCE_CHANGED') return 'MIGRATION_SOURCE_CHANGED'
  if (error.code === 'FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE') return 'MIGRATION_INCOMPATIBLE'
  if (error.code === 'LEGACY_MIGRATION_INCOMPATIBLE' || error.code === 'LEGACY_EFFECTIVE_TRUCK_UNRESOLVED' || error.code === 'LEGACY_PROJECTION_MISMATCH') return 'MIGRATION_UNRESOLVED'
  return 'LIFECYCLE_STATE_INVALID'
}

export function activeFleetsForPile(
  projection: ReadyFleetOperationalProjection,
  pileId: PileId,
): readonly ActiveFleetOperationalProjection[] {
  return projection.activeFleets.filter((fleet) => fleet.activeDestinationPileIds.includes(pileId))
}

export function eligibleTruckIdsForPile(
  projection: ReadyFleetOperationalProjection,
  pileId: PileId,
): readonly TruckId[] {
  const trucks = new Map<string, TruckId>()
  for (const fleet of activeFleetsForPile(projection, pileId)) {
    for (const truckId of fleet.sharedTruckIds) trucks.set(truckId as string, truckId)
  }
  return [...trucks.values()].sort((left, right) => String(left).localeCompare(String(right)))
}

export function activeFleetsForPileTruck(
  projection: ReadyFleetOperationalProjection,
  pileId: PileId,
  truckId: TruckId,
): readonly ActiveFleetOperationalProjection[] {
  return activeFleetsForPile(projection, pileId)
    .filter((fleet) => fleet.sharedTruckIds.includes(truckId))
}

export function activeDestinationsForAssignment(
  projection: ReadyFleetOperationalProjection,
  assignmentId: FleetAssignmentId,
): readonly PileId[] {
  return projection.activeFleets.find((fleet) => fleet.assignmentId === assignmentId)?.activeDestinationPileIds ?? []
}

export function effectiveExcaForAssignment(
  projection: ReadyFleetOperationalProjection,
  assignmentId: FleetAssignmentId,
): ExcaCode | undefined {
  return projection.activeFleets.find((fleet) => fleet.assignmentId === assignmentId)?.excaCode
}

export function historicalAssignments(
  projection: ReadyFleetOperationalProjection,
): readonly HistoricalFleetOperationalProjection[] {
  return projection.historicalAssignments
}
