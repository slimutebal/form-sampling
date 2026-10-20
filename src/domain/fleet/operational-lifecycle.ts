import type { Brand } from '../common/brand'
import type { EmployeeId, FleetId, FrontId, PileId, ShiftId, TruckId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import type { ExcaCode } from './exca-code'
import { resolveEffectiveFleet } from './fleet-resolution'
import type { FleetSetup } from './fleet-setup'
import { deriveFrontLineage } from './front-lineage'
import type { HaulerCode } from '../master/master-codes'

/**
 * Phase 0 operational lifecycle domain.  This module is intentionally
 * persistence-free: callers provide all IDs, timestamps and validation
 * context, while future application/infrastructure phases make the results
 * durable atomically.
 */

export type FleetAssignmentId = Brand<string, 'FleetAssignmentId'>
export type FleetConfigurationRevisionId = Brand<string, 'FleetConfigurationRevisionId'>
export type FleetDestinationAssignmentId = Brand<string, 'FleetDestinationAssignmentId'>
export type FleetOperationalEventId = Brand<string, 'FleetOperationalEventId'>
export type FleetCommandId = Brand<string, 'FleetCommandId'>

export type FleetLifecycleProvenance = 'OPERATOR' | 'LEGACY_ACTIVE' | 'LEGACY_HISTORICAL' | 'LEGACY_UNRESOLVED'
export type FleetAssignmentCloseReason = 'TRANSFERRED' | 'REACTIVATED' | 'DEACTIVATED'
export type FleetConfigurationReason = 'ACTIVATED' | 'TRUCK_POOL_UPDATED' | 'EXCA_UPDATED'

export interface FleetIdentity {
  readonly shiftWorkspaceId: ShiftId
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly haulerCode: HaulerCode
  readonly lineageRootFleetId: FleetId
  readonly provenance: FleetLifecycleProvenance
}

/** Immutable activation record. Closure is represented only by a later event. */
export interface FleetOperationalAssignment {
  readonly assignmentId: FleetAssignmentId
  readonly shiftWorkspaceId: ShiftId
  readonly fleetId: FleetId
  readonly frontId: FrontId
  readonly lineageRootFleetId: FleetId
  readonly replacesAssignmentId?: FleetAssignmentId
  readonly activatedAt: Date | null
  readonly activatedBy: EmployeeId | null
  readonly provenance: FleetLifecycleProvenance
  /** A newly activated assignment begins at version 1; later version is projected from events. */
  readonly initialVersion: 1
}

export interface FleetConfigurationRevision {
  readonly revisionId: FleetConfigurationRevisionId
  readonly assignmentId: FleetAssignmentId
  readonly revisionNumber: number
  readonly effectiveAt: Date | null
  readonly excaCode?: ExcaCode
  readonly truckIds: readonly TruckId[]
  readonly createdBy: EmployeeId | null
  readonly reason: FleetConfigurationReason
}

/** Immutable opening of one Pile destination. Closure is represented by an event. */
export interface FleetDestinationAssignment {
  readonly destinationAssignmentId: FleetDestinationAssignmentId
  readonly assignmentId: FleetAssignmentId
  readonly pileId: PileId
  readonly openedAt: Date | null
  readonly openedBy: EmployeeId | null
}

export type FleetOperationalEvent =
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'ASSIGNMENT_ACTIVATED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: { readonly activation: 'TRANSFER' | 'REACTIVATION' | 'INITIAL' }
    }
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'ASSIGNMENT_CLOSED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: { readonly closeReason: FleetAssignmentCloseReason; readonly replacementAssignmentId?: FleetAssignmentId }
    }
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'DESTINATION_ADDED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: { readonly destinationAssignmentId: FleetDestinationAssignmentId; readonly pileId: PileId }
    }
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'DESTINATION_REDIRECTED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: {
        readonly closedDestinationAssignmentId: FleetDestinationAssignmentId
        readonly openedDestinationAssignmentId: FleetDestinationAssignmentId
        readonly fromPileId: PileId
        readonly toPileId: PileId
      }
    }
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'DESTINATION_REMOVED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: { readonly destinationAssignmentId: FleetDestinationAssignmentId; readonly pileId: PileId }
    }
  | {
      readonly eventId: FleetOperationalEventId
      readonly commandId: FleetCommandId
      readonly assignmentId: FleetAssignmentId
      readonly type: 'CONFIGURATION_REVISED'
      readonly occurredAt: Date
      readonly recordedAt: Date
      readonly actorId: EmployeeId
      readonly reason?: string
      readonly expectedVersion: number
      readonly payload: { readonly revisionId: FleetConfigurationRevisionId; readonly revisionNumber: number; readonly kind: 'TRUCK_POOL' | 'EXCA' }
    }

export interface FleetSuccessfulCommandReceipt {
  readonly status: 'APPLIED'
  readonly replayed: boolean
  readonly commandId: FleetCommandId
  readonly eventIds: readonly FleetOperationalEventId[]
  readonly assignmentIds: readonly FleetAssignmentId[]
  /** Array rather than Map so a future IndexedDB receipt remains cloneable. */
  readonly resultingAssignmentVersions: readonly { readonly assignmentId: FleetAssignmentId; readonly version: number }[]
}

export interface FleetRejectedCommandProposal {
  readonly status: 'REJECTED'
  readonly commandId: FleetCommandId
  readonly reasonCode: FleetLifecycleError['code']
  readonly commandKind: FleetLifecycleCommandKind
  readonly payload: FleetLifecycleCommandPayload
  readonly currentAssignmentVersion?: number
}

export type FleetCommandReceipt = FleetSuccessfulCommandReceipt | FleetRejectedCommandProposal

export interface FleetOperationalLifecycleState {
  readonly identities: readonly FleetIdentity[]
  readonly assignments: readonly FleetOperationalAssignment[]
  readonly configurationRevisions: readonly FleetConfigurationRevision[]
  readonly destinationAssignments: readonly FleetDestinationAssignment[]
  readonly events: readonly FleetOperationalEvent[]
  /** Future persistence stores these to make retries idempotent. */
  readonly commandReceipts: readonly FleetSuccessfulCommandReceipt[]
}

export interface FleetOperationalAssignmentProjection {
  readonly assignment: FleetOperationalAssignment
  readonly version: number
  readonly active: boolean
  readonly activeDestinations: readonly FleetDestinationAssignment[]
  readonly effectiveConfiguration?: FleetConfigurationRevision
}

export interface FleetOperationalProjection {
  readonly assignments: readonly FleetOperationalAssignmentProjection[]
  readonly activeAssignmentIds: readonly FleetAssignmentId[]
}

export type FleetLifecycleErrorCode =
  | 'DUPLICATE_FLEET_IDENTITY'
  | 'DUPLICATE_ASSIGNMENT_ID'
  | 'DUPLICATE_CONFIGURATION_REVISION_ID'
  | 'DUPLICATE_DESTINATION_ASSIGNMENT_ID'
  | 'DUPLICATE_EVENT_ID'
  | 'DUPLICATE_COMMAND_ID'
  | 'FLEET_IDENTITY_NOT_FOUND'
  | 'FLEET_COMPANY_OWNERSHIP_MISMATCH'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_NOT_ACTIVE'
  | 'ASSIGNMENT_ALREADY_CLOSED'
  | 'FLEET_ALREADY_ACTIVE'
  | 'FLEET_REACTIVATION_TARGET_INVALID'
  | 'FLEET_REPLACEMENT_NOT_IN_SAME_LINEAGE'
  | 'ASSIGNMENT_SUPERSESSION_NOT_FOUND'
  | 'ASSIGNMENT_SUPERSESSION_CYCLE'
  | 'ASSIGNMENT_SUPERSESSION_BRANCHING'
  | 'ASSIGNMENT_LINEAGE_MULTIPLE_ACTIVE'
  | 'ASSIGNMENT_VERSION_STALE'
  | 'CONFIGURATION_REVISION_ORDER_INVALID'
  | 'CONFIGURATION_NOT_FOUND'
  | 'DUPLICATE_FLEET_TRUCK'
  | 'TRUCK_NOT_ELIGIBLE_FOR_COMPANY'
  | 'EXCA_NOT_ELIGIBLE_FOR_COMPANY'
  | 'DESTINATION_NOT_FOUND'
  | 'DESTINATION_NOT_ACTIVE'
  | 'DESTINATION_ALREADY_ACTIVE'
  | 'DESTINATION_NOT_ELIGIBLE_FOR_COMPANY'
  | 'PILE_ASSIGNED_TO_DIFFERENT_COMPANY'
  | 'LAST_DESTINATION_REMOVAL_REQUIRES_DEACTIVATION'
  | 'SHIFT_OPERATIONAL_WINDOW_UNRESOLVED'
  | 'OCCURRED_AT_OUTSIDE_SHIFT_WINDOW'
  | 'OCCURRED_AT_REASON_REQUIRED'
  | 'RECORDED_BEFORE_OCCURRED'
  | 'TEMPORAL_CONTEXT_UNRESOLVED'
  | 'TEMPORAL_CONTEXT_AMBIGUOUS'
  | 'LEGACY_MIGRATION_INCOMPATIBLE'
  | 'LEGACY_EFFECTIVE_TRUCK_UNRESOLVED'
  | 'LEGACY_PROJECTION_MISMATCH'

export interface FleetLifecycleError extends DomainError {
  readonly code: FleetLifecycleErrorCode
}

export interface FleetOperationalShiftWindow {
  readonly shiftWorkspaceId: ShiftId
  readonly startsAt: Date
  readonly endsAt: Date
}

/** Purely injected validation; Phase 0 never queries persistence or network. */
export interface FleetLifecycleValidationContext {
  readonly shiftWindow?: FleetOperationalShiftWindow
  readonly isPileEligibleForCompany?: (pileId: PileId, haulerCode: HaulerCode) => boolean
  readonly isTruckEligibleForCompany?: (truckId: TruckId, haulerCode: HaulerCode) => boolean
  readonly isExcaEligibleForCompany?: (excaCode: ExcaCode, haulerCode: HaulerCode) => boolean
}

interface FleetCommandBase {
  readonly commandId: FleetCommandId
  readonly expectedAssignmentVersion: number
  readonly occurredAt: Date
  readonly recordedAt: Date
  readonly actorId: EmployeeId
  readonly occurredAtAdjusted?: boolean
  readonly reason?: string
}

export interface RedirectFleetDestinationCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly closedDestinationAssignmentId: FleetDestinationAssignmentId
  readonly openedDestinationAssignmentId: FleetDestinationAssignmentId
  readonly eventId: FleetOperationalEventId
  readonly destinationPileId: PileId
}

export interface AddFleetDestinationCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly destinationAssignmentId: FleetDestinationAssignmentId
  readonly eventId: FleetOperationalEventId
  readonly pileId: PileId
}

export interface RemoveFleetDestinationCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly destinationAssignmentId: FleetDestinationAssignmentId
  readonly eventId: FleetOperationalEventId
}

export interface DeactivateFleetAssignmentCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly eventId: FleetOperationalEventId
}

interface NewOperationalAssignmentCommand extends FleetCommandBase {
  readonly replacementAssignmentId: FleetAssignmentId
  readonly newAssignmentId: FleetAssignmentId
  readonly activationEventId: FleetOperationalEventId
  readonly closureEventId: FleetOperationalEventId
  readonly configurationRevisionId: FleetConfigurationRevisionId
  readonly destinationAssignments: readonly { readonly destinationAssignmentId: FleetDestinationAssignmentId; readonly pileId: PileId }[]
  readonly excaCode?: ExcaCode
  readonly truckIds: readonly TruckId[]
}

export interface TransferFleetAssignmentCommand extends NewOperationalAssignmentCommand {
  readonly targetFleetId: FleetId
}

export interface ReactivateFleetAssignmentCommand extends NewOperationalAssignmentCommand {
  readonly reactivatedFleetId: FleetId
}

export interface UpdateFleetTruckPoolCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly revisionId: FleetConfigurationRevisionId
  readonly eventId: FleetOperationalEventId
  readonly truckIds: readonly TruckId[]
}

export interface UpdateFleetExcaCommand extends FleetCommandBase {
  readonly assignmentId: FleetAssignmentId
  readonly revisionId: FleetConfigurationRevisionId
  readonly eventId: FleetOperationalEventId
  readonly excaCode?: ExcaCode
}

export type FleetLifecycleCommandKind =
  | 'REDIRECT_DESTINATION'
  | 'ADD_DESTINATION'
  | 'REMOVE_DESTINATION'
  | 'TRANSFER'
  | 'REACTIVATE'
  | 'DEACTIVATE'
  | 'UPDATE_TRUCK_POOL'
  | 'UPDATE_EXCA'

export type FleetLifecycleCommandPayload =
  | RedirectFleetDestinationCommand
  | AddFleetDestinationCommand
  | RemoveFleetDestinationCommand
  | TransferFleetAssignmentCommand
  | ReactivateFleetAssignmentCommand
  | DeactivateFleetAssignmentCommand
  | UpdateFleetTruckPoolCommand
  | UpdateFleetExcaCommand

function stableCommandValue(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() }
  if (Array.isArray(value)) return value.map(stableCommandValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableCommandValue(nested)]),
    )
  }
  return value
}

/** Stable, non-cryptographic fingerprint for local idempotency comparisons. */
export function fingerprintFleetLifecycleCommandPayload(payload: FleetLifecycleCommandPayload): string {
  return JSON.stringify(stableCommandValue(payload))
}

export interface FleetLifecycleTransitionResult {
  readonly state: FleetOperationalLifecycleState
  readonly projection: FleetOperationalProjection
  readonly receipt: FleetSuccessfulCommandReceipt
}

/**
 * Persistence is intentionally deferred. This serializable proposal lets a
 * future application layer retain a rejected offline command for review.
 */
export function createFleetRejectedCommandProposal(
  commandKind: FleetLifecycleCommandKind,
  payload: FleetLifecycleCommandPayload,
  error: FleetLifecycleError,
  state: FleetOperationalLifecycleState,
): FleetRejectedCommandProposal {
  const assignmentId = 'assignmentId' in payload ? payload.assignmentId : payload.replacementAssignmentId
  const assignment = assignmentById(state, assignmentId)
  return {
    status: 'REJECTED',
    commandId: payload.commandId,
    reasonCode: error.code,
    commandKind,
    payload,
    currentAssignmentVersion: assignment ? assignmentVersion(state, assignment.assignmentId) : undefined,
  }
}

export interface FleetOperationalContext {
  readonly assignmentId: FleetAssignmentId
  readonly configurationRevisionId: FleetConfigurationRevisionId
  readonly destinationAssignmentId: FleetDestinationAssignmentId
  readonly occurredAt: Date
  readonly recordedAt?: Date
}

function lifecycleError(code: FleetLifecycleErrorCode, message: string): Result<never, FleetLifecycleError> {
  return err({ code, message })
}

function assignmentById(state: FleetOperationalLifecycleState, assignmentId: FleetAssignmentId): FleetOperationalAssignment | undefined {
  return state.assignments.find((assignment) => assignment.assignmentId === assignmentId)
}

function identityByFleetId(state: FleetOperationalLifecycleState, fleetId: FleetId, shiftWorkspaceId?: ShiftId): FleetIdentity | undefined {
  return state.identities.find((identity) => identity.fleetId === fleetId && (shiftWorkspaceId === undefined || identity.shiftWorkspaceId === shiftWorkspaceId))
}

function closedAtForAssignment(state: FleetOperationalLifecycleState, assignmentId: FleetAssignmentId): Date | undefined {
  const event = state.events.find(
    (candidate) => candidate.assignmentId === assignmentId && candidate.type === 'ASSIGNMENT_CLOSED',
  )
  return event?.occurredAt
}

function closedDestinationIds(state: FleetOperationalLifecycleState): ReadonlySet<FleetDestinationAssignmentId> {
  const result = new Set<FleetDestinationAssignmentId>()
  for (const event of state.events) {
    if (event.type === 'DESTINATION_REMOVED') result.add(event.payload.destinationAssignmentId)
    if (event.type === 'DESTINATION_REDIRECTED') result.add(event.payload.closedDestinationAssignmentId)
  }
  return result
}

function isLegacyHistorical(assignment: FleetOperationalAssignment): boolean {
  return assignment.provenance === 'LEGACY_HISTORICAL' || assignment.provenance === 'LEGACY_UNRESOLVED'
}

function assignmentVersion(state: FleetOperationalLifecycleState, assignmentId: FleetAssignmentId): number {
  return 1 + state.events.filter((event) =>
    event.assignmentId === assignmentId && event.type !== 'ASSIGNMENT_ACTIVATED',
  ).length
}

export function projectFleetOperationalLifecycle(state: FleetOperationalLifecycleState): FleetOperationalProjection {
  const closedDestinations = closedDestinationIds(state)
  const assignments = state.assignments.map((assignment) => {
    const active = !isLegacyHistorical(assignment) && closedAtForAssignment(state, assignment.assignmentId) === undefined
    const activeDestinations = active
      ? state.destinationAssignments.filter(
          (destination) => destination.assignmentId === assignment.assignmentId && !closedDestinations.has(destination.destinationAssignmentId),
        )
      : []
    const revisions = state.configurationRevisions
      .filter((revision) => revision.assignmentId === assignment.assignmentId)
      .sort((left, right) => left.revisionNumber - right.revisionNumber)
    return {
      assignment,
      version: assignmentVersion(state, assignment.assignmentId),
      active,
      activeDestinations,
      effectiveConfiguration: revisions.at(-1),
    }
  })
  return { assignments, activeAssignmentIds: assignments.filter((assignment) => assignment.active).map((assignment) => assignment.assignment.assignmentId) }
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function validateState(state: FleetOperationalLifecycleState): Result<FleetOperationalLifecycleState, FleetLifecycleError> {
  const identityKeys = state.identities.map((identity) => `${identity.shiftWorkspaceId}:${identity.fleetId}`)
  if (hasDuplicate(identityKeys) || hasDuplicate(state.identities.map((identity) => `${identity.shiftWorkspaceId}:${identity.frontId}`))) {
    return lifecycleError('DUPLICATE_FLEET_IDENTITY', 'FleetId and FrontId must be unique within one Shift Workspace')
  }
  if (hasDuplicate(state.assignments.map((assignment) => assignment.assignmentId))) return lifecycleError('DUPLICATE_ASSIGNMENT_ID', 'AssignmentId must be unique')
  if (hasDuplicate(state.configurationRevisions.map((revision) => revision.revisionId))) return lifecycleError('DUPLICATE_CONFIGURATION_REVISION_ID', 'RevisionId must be unique')
  if (hasDuplicate(state.destinationAssignments.map((destination) => destination.destinationAssignmentId))) return lifecycleError('DUPLICATE_DESTINATION_ASSIGNMENT_ID', 'DestinationAssignmentId must be unique')
  if (hasDuplicate(state.events.map((event) => event.eventId))) return lifecycleError('DUPLICATE_EVENT_ID', 'EventId must be unique')
  if (hasDuplicate(state.commandReceipts.map((receipt) => receipt.commandId))) return lifecycleError('DUPLICATE_COMMAND_ID', 'CommandId must have one receipt')

  for (const assignment of state.assignments) {
    const identity = identityByFleetId(state, assignment.fleetId, assignment.shiftWorkspaceId)
    if (!identity || identity.shiftWorkspaceId !== assignment.shiftWorkspaceId || identity.frontId !== assignment.frontId || identity.lineageRootFleetId !== assignment.lineageRootFleetId) {
      return lifecycleError('FLEET_IDENTITY_NOT_FOUND', `Assignment ${assignment.assignmentId} does not match a FleetIdentity`)
    }
    if (assignment.replacesAssignmentId) {
      const replaced = assignmentById(state, assignment.replacesAssignmentId)
      if (!replaced) return lifecycleError('ASSIGNMENT_SUPERSESSION_NOT_FOUND', `Assignment ${assignment.assignmentId} replaces an unknown assignment`)
      if (replaced.lineageRootFleetId !== assignment.lineageRootFleetId) return lifecycleError('FLEET_REPLACEMENT_NOT_IN_SAME_LINEAGE', 'Replacement must use the same lifecycle root')
    }
  }

  const replacementCount = new Map<FleetAssignmentId, number>()
  for (const assignment of state.assignments) {
    if (assignment.replacesAssignmentId) replacementCount.set(assignment.replacesAssignmentId, (replacementCount.get(assignment.replacesAssignmentId) ?? 0) + 1)
  }
  if ([...replacementCount.values()].some((count) => count > 1)) return lifecycleError('ASSIGNMENT_SUPERSESSION_BRANCHING', 'An assignment may have only one replacement assignment')
  for (const assignment of state.assignments) {
    const seen = new Set<FleetAssignmentId>([assignment.assignmentId])
    let current = assignment
    while (current.replacesAssignmentId) {
      const replaced = assignmentById(state, current.replacesAssignmentId)
      if (!replaced) break
      if (seen.has(replaced.assignmentId)) return lifecycleError('ASSIGNMENT_SUPERSESSION_CYCLE', 'Assignment supersession cannot form a cycle')
      seen.add(replaced.assignmentId)
      current = replaced
    }
  }

  for (const revision of state.configurationRevisions) {
    const assignment = assignmentById(state, revision.assignmentId)
    if (!assignment) return lifecycleError('ASSIGNMENT_NOT_FOUND', `Revision ${revision.revisionId} has unknown assignment`)
    if (!Number.isInteger(revision.revisionNumber) || revision.revisionNumber < 1 || hasDuplicate(revision.truckIds.map(String))) {
      return lifecycleError(revision.truckIds.length !== new Set(revision.truckIds).size ? 'DUPLICATE_FLEET_TRUCK' : 'CONFIGURATION_REVISION_ORDER_INVALID', 'Configuration revision is invalid')
    }
  }
  for (const assignment of state.assignments) {
    const numbers = state.configurationRevisions.filter((revision) => revision.assignmentId === assignment.assignmentId).map((revision) => revision.revisionNumber).sort((a, b) => a - b)
    if (hasDuplicate(numbers.map(String)) || numbers.some((number, index) => number !== index + 1)) return lifecycleError('CONFIGURATION_REVISION_ORDER_INVALID', `Configuration revisions for ${assignment.assignmentId} must be contiguous`)
  }

  for (const destination of state.destinationAssignments) {
    if (!assignmentById(state, destination.assignmentId)) return lifecycleError('ASSIGNMENT_NOT_FOUND', `Destination ${destination.destinationAssignmentId} has unknown assignment`)
  }
  for (const event of state.events) {
    if (!assignmentById(state, event.assignmentId)) return lifecycleError('ASSIGNMENT_NOT_FOUND', `Event ${event.eventId} has unknown assignment`)
  }
  const projection = projectFleetOperationalLifecycle(state)
  for (const assignment of projection.assignments) {
    if (hasDuplicate(assignment.activeDestinations.map((destination) => String(destination.pileId)))) return lifecycleError('DESTINATION_ALREADY_ACTIVE', `Assignment ${assignment.assignment.assignmentId} has duplicate active Pile destinations`)
  }
  const activeByRoot = new Map<string, number>()
  for (const assignment of projection.assignments.filter((candidate) => candidate.active)) {
    const root = `${assignment.assignment.shiftWorkspaceId}:${assignment.assignment.lineageRootFleetId}`
    activeByRoot.set(root, (activeByRoot.get(root) ?? 0) + 1)
  }
  if ([...activeByRoot.values()].some((count) => count > 1)) return lifecycleError('ASSIGNMENT_LINEAGE_MULTIPLE_ACTIVE', 'One lifecycle root can have only one active assignment')

  const companyByActivePile = new Map<PileId, HaulerCode>()
  for (const assignment of projection.assignments.filter((candidate) => candidate.active)) {
    const identity = identityByFleetId(state, assignment.assignment.fleetId, assignment.assignment.shiftWorkspaceId)
    if (!identity) continue
    for (const destination of assignment.activeDestinations) {
      const existing = companyByActivePile.get(destination.pileId)
      if (existing && existing !== identity.haulerCode) return lifecycleError('PILE_ASSIGNED_TO_DIFFERENT_COMPANY', `Pile ${destination.pileId} is active for different Companies`)
      companyByActivePile.set(destination.pileId, identity.haulerCode)
    }
  }
  return ok(state)
}

/** Validates a candidate lifecycle state without mutating it. */
export function createFleetOperationalLifecycleState(state: FleetOperationalLifecycleState): Result<FleetOperationalLifecycleState, FleetLifecycleError> {
  return validateState({
    identities: [...state.identities],
    assignments: [...state.assignments],
    configurationRevisions: state.configurationRevisions.map((revision) => ({ ...revision, truckIds: [...revision.truckIds] })),
    destinationAssignments: [...state.destinationAssignments],
    events: [...state.events],
    commandReceipts: [...state.commandReceipts],
  })
}

function validateTiming(base: FleetCommandBase, assignment: FleetOperationalAssignment, context: FleetLifecycleValidationContext): Result<void, FleetLifecycleError> {
  if (base.recordedAt.getTime() < base.occurredAt.getTime()) return lifecycleError('RECORDED_BEFORE_OCCURRED', 'recordedAt cannot precede occurredAt')
  if (base.occurredAtAdjusted && !base.reason?.trim()) return lifecycleError('OCCURRED_AT_REASON_REQUIRED', 'A manually adjusted occurredAt requires a reason')
  const window = context.shiftWindow
  if (!window || window.shiftWorkspaceId !== assignment.shiftWorkspaceId) return lifecycleError('SHIFT_OPERATIONAL_WINDOW_UNRESOLVED', 'A resolved operational Shift window is required')
  if (window.startsAt.getTime() > base.occurredAt.getTime() || window.endsAt.getTime() < base.occurredAt.getTime()) return lifecycleError('OCCURRED_AT_OUTSIDE_SHIFT_WINDOW', 'occurredAt is outside the permitted Shift operational window')
  return ok(undefined)
}

function ensureEventIdAvailable(state: FleetOperationalLifecycleState, eventIds: readonly FleetOperationalEventId[]): Result<void, FleetLifecycleError> {
  const existing = new Set(state.events.map((event) => event.eventId))
  if (hasDuplicate(eventIds.map(String)) || eventIds.some((eventId) => existing.has(eventId))) return lifecycleError('DUPLICATE_EVENT_ID', 'EventId already exists')
  return ok(undefined)
}

function ensureAssignmentVersion(state: FleetOperationalLifecycleState, assignmentId: FleetAssignmentId, expected: number): Result<FleetOperationalAssignment, FleetLifecycleError> {
  const assignment = assignmentById(state, assignmentId)
  if (!assignment) return lifecycleError('ASSIGNMENT_NOT_FOUND', `Assignment ${assignmentId} does not exist`)
  const actual = assignmentVersion(state, assignmentId)
  if (actual !== expected) return lifecycleError('ASSIGNMENT_VERSION_STALE', `Expected assignment version ${expected}, current version is ${actual}`)
  if (isLegacyHistorical(assignment) || closedAtForAssignment(state, assignmentId)) return lifecycleError('ASSIGNMENT_NOT_ACTIVE', `Assignment ${assignmentId} is not active`)
  return ok(assignment)
}

function ensurePileEligible(state: FleetOperationalLifecycleState, assignment: FleetOperationalAssignment, pileId: PileId, context: FleetLifecycleValidationContext): Result<void, FleetLifecycleError> {
  const identity = identityByFleetId(state, assignment.fleetId, assignment.shiftWorkspaceId)
  if (!identity) return lifecycleError('FLEET_IDENTITY_NOT_FOUND', 'Fleet identity is missing')
  if (context.isPileEligibleForCompany && !context.isPileEligibleForCompany(pileId, identity.haulerCode)) return lifecycleError('DESTINATION_NOT_ELIGIBLE_FOR_COMPANY', `Pile ${pileId} is not eligible for this Company`)
  for (const projection of projectFleetOperationalLifecycle(state).assignments.filter((candidate) => candidate.active)) {
    const otherIdentity = identityByFleetId(state, projection.assignment.fleetId, projection.assignment.shiftWorkspaceId)
    if (otherIdentity && otherIdentity.haulerCode !== identity.haulerCode && projection.activeDestinations.some((destination) => destination.pileId === pileId)) return lifecycleError('PILE_ASSIGNED_TO_DIFFERENT_COMPANY', `Pile ${pileId} belongs to active Fleet(s) from a different Company`)
  }
  return ok(undefined)
}

function validateConfiguration(state: FleetOperationalLifecycleState, assignment: FleetOperationalAssignment, truckIds: readonly TruckId[], excaCode: ExcaCode | undefined, context: FleetLifecycleValidationContext): Result<void, FleetLifecycleError> {
  if (hasDuplicate(truckIds.map(String))) return lifecycleError('DUPLICATE_FLEET_TRUCK', 'Truck Pool may not contain duplicate Truck IDs')
  const identity = identityByFleetId(state, assignment.fleetId, assignment.shiftWorkspaceId)
  if (!identity) return lifecycleError('FLEET_IDENTITY_NOT_FOUND', 'Fleet identity is missing')
  if (context.isTruckEligibleForCompany && truckIds.some((truckId) => !context.isTruckEligibleForCompany?.(truckId, identity.haulerCode))) return lifecycleError('TRUCK_NOT_ELIGIBLE_FOR_COMPANY', 'Truck does not belong to this Company')
  if (excaCode && context.isExcaEligibleForCompany && !context.isExcaEligibleForCompany(excaCode, identity.haulerCode)) return lifecycleError('EXCA_NOT_ELIGIBLE_FOR_COMPANY', 'Exca does not belong to this Company')
  return ok(undefined)
}

function receiptFrom(state: FleetOperationalLifecycleState, commandId: FleetCommandId): FleetSuccessfulCommandReceipt | undefined {
  return state.commandReceipts.find((receipt) => receipt.commandId === commandId)
}

function replayOrContinue(state: FleetOperationalLifecycleState, commandId: FleetCommandId): FleetLifecycleTransitionResult | undefined {
  const receipt = receiptFrom(state, commandId)
  return receipt ? { state, projection: projectFleetOperationalLifecycle(state), receipt: { ...receipt, replayed: true, eventIds: [...receipt.eventIds], assignmentIds: [...receipt.assignmentIds], resultingAssignmentVersions: receipt.resultingAssignmentVersions.map((version) => ({ ...version })) } } : undefined
}

function commit(
  state: FleetOperationalLifecycleState,
  commandId: FleetCommandId,
  newAssignments: readonly FleetOperationalAssignment[],
  newRevisions: readonly FleetConfigurationRevision[],
  newDestinations: readonly FleetDestinationAssignment[],
  events: readonly FleetOperationalEvent[],
): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const candidateWithoutReceipt: FleetOperationalLifecycleState = {
    ...state,
    assignments: [...state.assignments, ...newAssignments],
    configurationRevisions: [...state.configurationRevisions, ...newRevisions],
    destinationAssignments: [...state.destinationAssignments, ...newDestinations],
    events: [...state.events, ...events],
  }
  const valid = validateState(candidateWithoutReceipt)
  if (!valid.ok) return valid
  const projection = projectFleetOperationalLifecycle(valid.value)
  const resultingAssignmentVersions = new Map<FleetAssignmentId, number>()
  for (const assignment of [...newAssignments, ...state.assignments.filter((assignment) => events.some((event) => event.assignmentId === assignment.assignmentId))]) {
    resultingAssignmentVersions.set(assignment.assignmentId, assignmentVersion(valid.value, assignment.assignmentId))
  }
  const receipt: FleetSuccessfulCommandReceipt = {
    status: 'APPLIED', replayed: false, commandId, eventIds: events.map((event) => event.eventId), assignmentIds: newAssignments.map((assignment) => assignment.assignmentId), resultingAssignmentVersions: [...resultingAssignmentVersions.entries()].map(([assignmentId, version]) => ({ assignmentId, version })),
  }
  const nextState = { ...valid.value, commandReceipts: [...valid.value.commandReceipts, receipt] }
  return ok({ state: nextState, projection, receipt })
}

function activeDestination(state: FleetOperationalLifecycleState, assignmentId: FleetAssignmentId, destinationId: FleetDestinationAssignmentId): FleetDestinationAssignment | undefined {
  return projectFleetOperationalLifecycle(state).assignments.find((candidate) => candidate.assignment.assignmentId === assignmentId)?.activeDestinations.find((destination) => destination.destinationAssignmentId === destinationId)
}

export function addFleetDestination(state: FleetOperationalLifecycleState, command: AddFleetDestinationCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  if (projectFleetOperationalLifecycle(state).assignments.find((candidate) => candidate.assignment.assignmentId === command.assignmentId)?.activeDestinations.some((destination) => destination.pileId === command.pileId)) return lifecycleError('DESTINATION_ALREADY_ACTIVE', `Pile ${command.pileId} is already active`)
  const eligible = ensurePileEligible(state, assignment.value, command.pileId, context); if (!eligible.ok) return eligible
  const destination: FleetDestinationAssignment = { destinationAssignmentId: command.destinationAssignmentId, assignmentId: command.assignmentId, pileId: command.pileId, openedAt: command.occurredAt, openedBy: command.actorId }
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'DESTINATION_ADDED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { destinationAssignmentId: destination.destinationAssignmentId, pileId: destination.pileId } }
  return commit(state, command.commandId, [], [], [destination], [event])
}

export function redirectFleetDestination(state: FleetOperationalLifecycleState, command: RedirectFleetDestinationCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const current = activeDestination(state, command.assignmentId, command.closedDestinationAssignmentId)
  if (!current) return lifecycleError('DESTINATION_NOT_ACTIVE', 'Redirect source destination is not active')
  if (current.pileId === command.destinationPileId) return lifecycleError('DESTINATION_ALREADY_ACTIVE', 'Redirect destination must differ from the source')
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  const eligible = ensurePileEligible(state, assignment.value, command.destinationPileId, context); if (!eligible.ok) return eligible
  const destination: FleetDestinationAssignment = { destinationAssignmentId: command.openedDestinationAssignmentId, assignmentId: command.assignmentId, pileId: command.destinationPileId, openedAt: command.occurredAt, openedBy: command.actorId }
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'DESTINATION_REDIRECTED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { closedDestinationAssignmentId: current.destinationAssignmentId, openedDestinationAssignmentId: destination.destinationAssignmentId, fromPileId: current.pileId, toPileId: destination.pileId } }
  return commit(state, command.commandId, [], [], [destination], [event])
}

export function removeFleetDestination(state: FleetOperationalLifecycleState, command: RemoveFleetDestinationCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const current = activeDestination(state, command.assignmentId, command.destinationAssignmentId)
  if (!current) return lifecycleError('DESTINATION_NOT_ACTIVE', 'Destination is not active')
  const activeDestinations = projectFleetOperationalLifecycle(state).assignments.find((candidate) => candidate.assignment.assignmentId === command.assignmentId)?.activeDestinations ?? []
  if (activeDestinations.length <= 1) return lifecycleError('LAST_DESTINATION_REMOVAL_REQUIRES_DEACTIVATION', 'The last active destination requires explicit Fleet deactivation')
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'DESTINATION_REMOVED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { destinationAssignmentId: current.destinationAssignmentId, pileId: current.pileId } }
  return commit(state, command.commandId, [], [], [], [event])
}

export function deactivateFleetAssignment(state: FleetOperationalLifecycleState, command: DeactivateFleetAssignmentCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'ASSIGNMENT_CLOSED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { closeReason: 'DEACTIVATED' } }
  return commit(state, command.commandId, [], [], [], [event])
}

function createReplacementAssignment(
  state: FleetOperationalLifecycleState,
  command: NewOperationalAssignmentCommand,
  targetFleetId: FleetId,
  activation: 'TRANSFER' | 'REACTIVATION',
  context: FleetLifecycleValidationContext,
): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const replaced = ensureAssignmentVersion(state, command.replacementAssignmentId, command.expectedAssignmentVersion); if (!replaced.ok) return replaced
  const timing = validateTiming(command, replaced.value, context); if (!timing.ok) return timing
  const targetIdentity = identityByFleetId(state, targetFleetId, replaced.value.shiftWorkspaceId)
  if (!targetIdentity) return lifecycleError('FLEET_IDENTITY_NOT_FOUND', `Fleet ${targetFleetId} does not exist in this Shift Workspace`)
  if (targetIdentity.shiftWorkspaceId !== replaced.value.shiftWorkspaceId || targetIdentity.lineageRootFleetId !== replaced.value.lineageRootFleetId) return lifecycleError('FLEET_REPLACEMENT_NOT_IN_SAME_LINEAGE', 'Replacement Fleet must belong to the same lifecycle root')
  const replacedIdentity = identityByFleetId(state, replaced.value.fleetId, replaced.value.shiftWorkspaceId)
  if (!replacedIdentity || replacedIdentity.haulerCode !== targetIdentity.haulerCode) return lifecycleError('FLEET_COMPANY_OWNERSHIP_MISMATCH', 'Transfer or reactivation cannot change Company ownership')
  if (projectFleetOperationalLifecycle(state).assignments.some((candidate) => candidate.active && candidate.assignment.fleetId === targetFleetId)) return lifecycleError('FLEET_ALREADY_ACTIVE', `Fleet ${targetFleetId} is already active`)
  if (activation === 'REACTIVATION' && !state.assignments.some((assignment) => assignment.fleetId === targetFleetId && assignment.shiftWorkspaceId === replaced.value.shiftWorkspaceId && !projectFleetOperationalLifecycle(state).assignments.some((projection) => projection.assignment.assignmentId === assignment.assignmentId && projection.active))) return lifecycleError('FLEET_REACTIVATION_TARGET_INVALID', 'Reactivation requires an existing inactive Fleet assignment')
  if (command.destinationAssignments.length === 0 || hasDuplicate(command.destinationAssignments.map((destination) => String(destination.destinationAssignmentId))) || hasDuplicate(command.destinationAssignments.map((destination) => String(destination.pileId)))) return lifecycleError('DESTINATION_ALREADY_ACTIVE', 'A replacement assignment requires unique active destinations')
  const eventIds = ensureEventIdAvailable(state, [command.activationEventId, command.closureEventId]); if (!eventIds.ok) return eventIds
  const targetAssignment: FleetOperationalAssignment = { assignmentId: command.newAssignmentId, shiftWorkspaceId: targetIdentity.shiftWorkspaceId, fleetId: targetIdentity.fleetId, frontId: targetIdentity.frontId, lineageRootFleetId: targetIdentity.lineageRootFleetId, replacesAssignmentId: replaced.value.assignmentId, activatedAt: command.occurredAt, activatedBy: command.actorId, provenance: 'OPERATOR', initialVersion: 1 }
  const configuration = validateConfiguration(state, targetAssignment, command.truckIds, command.excaCode, context); if (!configuration.ok) return configuration
  for (const destination of command.destinationAssignments) { const eligible = ensurePileEligible(state, targetAssignment, destination.pileId, context); if (!eligible.ok) return eligible }
  const revision: FleetConfigurationRevision = { revisionId: command.configurationRevisionId, assignmentId: targetAssignment.assignmentId, revisionNumber: 1, effectiveAt: command.occurredAt, excaCode: command.excaCode, truckIds: [...command.truckIds], createdBy: command.actorId, reason: 'ACTIVATED' }
  const destinations = command.destinationAssignments.map((destination): FleetDestinationAssignment => ({ destinationAssignmentId: destination.destinationAssignmentId, assignmentId: targetAssignment.assignmentId, pileId: destination.pileId, openedAt: command.occurredAt, openedBy: command.actorId }))
  const closure: FleetOperationalEvent = { eventId: command.closureEventId, commandId: command.commandId, assignmentId: replaced.value.assignmentId, type: 'ASSIGNMENT_CLOSED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { closeReason: activation === 'TRANSFER' ? 'TRANSFERRED' : 'REACTIVATED', replacementAssignmentId: targetAssignment.assignmentId } }
  const activated: FleetOperationalEvent = { eventId: command.activationEventId, commandId: command.commandId, assignmentId: targetAssignment.assignmentId, type: 'ASSIGNMENT_ACTIVATED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: 0, payload: { activation } }
  return commit(state, command.commandId, [targetAssignment], [revision], destinations, [closure, activated])
}

export function transferFleetAssignment(state: FleetOperationalLifecycleState, command: TransferFleetAssignmentCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  return createReplacementAssignment(state, command, command.targetFleetId, 'TRANSFER', context)
}

export function reactivateFleetAssignment(state: FleetOperationalLifecycleState, command: ReactivateFleetAssignmentCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  return createReplacementAssignment(state, command, command.reactivatedFleetId, 'REACTIVATION', context)
}

export function updateFleetTruckPool(state: FleetOperationalLifecycleState, command: UpdateFleetTruckPoolCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const current = projectFleetOperationalLifecycle(state).assignments.find((candidate) => candidate.assignment.assignmentId === command.assignmentId)?.effectiveConfiguration
  if (!current) return lifecycleError('CONFIGURATION_NOT_FOUND', 'Active assignment has no effective configuration')
  const valid = validateConfiguration(state, assignment.value, command.truckIds, current.excaCode, context); if (!valid.ok) return valid
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  const revision: FleetConfigurationRevision = { revisionId: command.revisionId, assignmentId: command.assignmentId, revisionNumber: current.revisionNumber + 1, effectiveAt: command.occurredAt, excaCode: current.excaCode, truckIds: [...command.truckIds], createdBy: command.actorId, reason: 'TRUCK_POOL_UPDATED' }
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'CONFIGURATION_REVISED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { revisionId: revision.revisionId, revisionNumber: revision.revisionNumber, kind: 'TRUCK_POOL' } }
  return commit(state, command.commandId, [], [revision], [], [event])
}

export function updateFleetExca(state: FleetOperationalLifecycleState, command: UpdateFleetExcaCommand, context: FleetLifecycleValidationContext): Result<FleetLifecycleTransitionResult, FleetLifecycleError> {
  const replay = replayOrContinue(state, command.commandId); if (replay) return ok(replay)
  const assignment = ensureAssignmentVersion(state, command.assignmentId, command.expectedAssignmentVersion); if (!assignment.ok) return assignment
  const timing = validateTiming(command, assignment.value, context); if (!timing.ok) return timing
  const current = projectFleetOperationalLifecycle(state).assignments.find((candidate) => candidate.assignment.assignmentId === command.assignmentId)?.effectiveConfiguration
  if (!current) return lifecycleError('CONFIGURATION_NOT_FOUND', 'Active assignment has no effective configuration')
  const valid = validateConfiguration(state, assignment.value, current.truckIds, command.excaCode, context); if (!valid.ok) return valid
  const eventId = ensureEventIdAvailable(state, [command.eventId]); if (!eventId.ok) return eventId
  const revision: FleetConfigurationRevision = { revisionId: command.revisionId, assignmentId: command.assignmentId, revisionNumber: current.revisionNumber + 1, effectiveAt: command.occurredAt, excaCode: command.excaCode, truckIds: [...current.truckIds], createdBy: command.actorId, reason: 'EXCA_UPDATED' }
  const event: FleetOperationalEvent = { eventId: command.eventId, commandId: command.commandId, assignmentId: command.assignmentId, type: 'CONFIGURATION_REVISED', occurredAt: command.occurredAt, recordedAt: command.recordedAt, actorId: command.actorId, reason: command.reason, expectedVersion: command.expectedAssignmentVersion, payload: { revisionId: revision.revisionId, revisionNumber: revision.revisionNumber, kind: 'EXCA' } }
  return commit(state, command.commandId, [], [revision], [], [event])
}

function eventClosesDestinationAt(state: FleetOperationalLifecycleState, destinationId: FleetDestinationAssignmentId): Date | undefined {
  const event = state.events.find((candidate) =>
    (candidate.type === 'DESTINATION_REMOVED' && candidate.payload.destinationAssignmentId === destinationId) ||
    (candidate.type === 'DESTINATION_REDIRECTED' && candidate.payload.closedDestinationAssignmentId === destinationId),
  )
  return event?.occurredAt
}

/** Resolves the immutable Fleet context that was valid at an operational occurrence time. */
export function resolveFleetOperationalContext(
  state: FleetOperationalLifecycleState,
  params: { readonly shiftWorkspaceId: ShiftId; readonly fleetId: FleetId; readonly pileId: PileId; readonly occurredAt: Date; readonly recordedAt?: Date },
): Result<FleetOperationalContext, FleetLifecycleError> {
  const candidates = state.assignments.filter((assignment) => {
    if (assignment.shiftWorkspaceId !== params.shiftWorkspaceId || assignment.fleetId !== params.fleetId || assignment.activatedAt === null || assignment.activatedAt.getTime() > params.occurredAt.getTime()) return false
    const closedAt = closedAtForAssignment(state, assignment.assignmentId)
    return !closedAt || closedAt.getTime() > params.occurredAt.getTime()
  })
  if (candidates.length === 0) return lifecycleError('TEMPORAL_CONTEXT_UNRESOLVED', 'No operational assignment was valid at occurredAt')
  if (candidates.length > 1) return lifecycleError('TEMPORAL_CONTEXT_AMBIGUOUS', 'More than one assignment was valid at occurredAt')
  const assignment = candidates[0]
  const configurations = state.configurationRevisions.filter((revision) => revision.assignmentId === assignment.assignmentId && revision.effectiveAt !== null && revision.effectiveAt.getTime() <= params.occurredAt.getTime()).sort((left, right) => right.revisionNumber - left.revisionNumber)
  if (configurations.length === 0) return lifecycleError('TEMPORAL_CONTEXT_UNRESOLVED', 'No configuration revision was valid at occurredAt')
  const destinations = state.destinationAssignments.filter((destination) => {
    if (destination.assignmentId !== assignment.assignmentId || destination.pileId !== params.pileId || destination.openedAt === null || destination.openedAt.getTime() > params.occurredAt.getTime()) return false
    const closedAt = eventClosesDestinationAt(state, destination.destinationAssignmentId)
    return !closedAt || closedAt.getTime() > params.occurredAt.getTime()
  })
  if (destinations.length === 0) return lifecycleError('TEMPORAL_CONTEXT_UNRESOLVED', 'No destination assignment was valid at occurredAt')
  if (destinations.length > 1) return lifecycleError('TEMPORAL_CONTEXT_AMBIGUOUS', 'More than one destination assignment was valid at occurredAt')
  return ok({ assignmentId: assignment.assignmentId, configurationRevisionId: configurations[0].revisionId, destinationAssignmentId: destinations[0].destinationAssignmentId, occurredAt: params.occurredAt, recordedAt: params.recordedAt })
}

export interface LegacyLifecycleMigrationInput {
  readonly shiftWorkspaceId: ShiftId
  readonly fleetSetup: FleetSetup
}

function legacyId<T extends string>(value: string): Brand<string, T> { return value as Brand<string, T> }

/**
 * Pure deterministic legacy projection. Historical Fronts are explicitly
 * classified historical even though no closure timestamp may exist.
 */
export function deriveLegacyFleetOperationalLifecycle(input: LegacyLifecycleMigrationInput): Result<FleetOperationalLifecycleState, FleetLifecycleError> {
  const fleetsByFront = new Map<FrontId, number>()
  for (const fleet of input.fleetSetup.fleets) fleetsByFront.set(fleet.frontId, (fleetsByFront.get(fleet.frontId) ?? 0) + 1)
  if ([...fleetsByFront.values()].some((count) => count !== 1)) return lifecycleError('LEGACY_MIGRATION_INCOMPATIBLE', 'Legacy setup must have exactly one Fleet per Front for lifecycle import')
  const lineage = deriveFrontLineage(input.fleetSetup)
  const fleetById = new Map(input.fleetSetup.fleets.map((fleet) => [fleet.fleetId, fleet]))
  const rootForFleet = (fleetId: FleetId): FleetId => {
    let current = fleetById.get(fleetId)
    while (current?.kind === 'DERIVED') current = fleetById.get(current.referenceFleetId)
    return current?.fleetId ?? fleetId
  }
  const identities: FleetIdentity[] = []
  const assignments: FleetOperationalAssignment[] = []
  const configurationRevisions: FleetConfigurationRevision[] = []
  const destinationAssignments: FleetDestinationAssignment[] = []
  for (const fleet of input.fleetSetup.fleets) {
    const front = input.fleetSetup.fronts.find((candidate) => candidate.frontId === fleet.frontId)
    if (!front) return lifecycleError('LEGACY_MIGRATION_INCOMPATIBLE', `Fleet ${fleet.fleetId} has no Front`)
    const historical = lineage.historicalFrontIds.includes(front.frontId)
    const provenance: FleetLifecycleProvenance = historical ? 'LEGACY_HISTORICAL' : 'LEGACY_ACTIVE'
    const assignmentId = legacyId<'FleetAssignmentId'>(`${input.shiftWorkspaceId}:legacy-assignment:${fleet.fleetId}`)
    identities.push({ shiftWorkspaceId: input.shiftWorkspaceId, fleetId: fleet.fleetId, frontId: front.frontId, haulerCode: front.haulerCode, lineageRootFleetId: rootForFleet(fleet.fleetId), provenance })
    assignments.push({ assignmentId, shiftWorkspaceId: input.shiftWorkspaceId, fleetId: fleet.fleetId, frontId: front.frontId, lineageRootFleetId: rootForFleet(fleet.fleetId), activatedAt: null, activatedBy: null, provenance, initialVersion: 1 })
    const effective = resolveEffectiveFleet(input.fleetSetup, fleet.fleetId)
    if (!effective.ok) return lifecycleError('LEGACY_EFFECTIVE_TRUCK_UNRESOLVED', effective.error.message)
    configurationRevisions.push({ revisionId: legacyId<'FleetConfigurationRevisionId'>(`${input.shiftWorkspaceId}:legacy-revision:${fleet.fleetId}:1`), assignmentId, revisionNumber: 1, effectiveAt: null, excaCode: front.excaCode, truckIds: [...effective.value.truckIds], createdBy: null, reason: 'ACTIVATED' })
    if (front.destinationPileId) destinationAssignments.push({ destinationAssignmentId: legacyId<'FleetDestinationAssignmentId'>(`${input.shiftWorkspaceId}:legacy-destination:${fleet.fleetId}:${front.destinationPileId}`), assignmentId, pileId: front.destinationPileId, openedAt: null, openedBy: null })
  }
  return createFleetOperationalLifecycleState({ identities, assignments, configurationRevisions, destinationAssignments, events: [], commandReceipts: [] })
}

/** Verifies that a legacy lifecycle projection has not silently changed current FleetSetup semantics. */
export function validateLegacyProjectionEquivalence(input: LegacyLifecycleMigrationInput, lifecycle: FleetOperationalLifecycleState): Result<void, FleetLifecycleError> {
  const oldLineage = deriveFrontLineage(input.fleetSetup)
  const oldActiveFleetIds = input.fleetSetup.fleets.filter((fleet) => oldLineage.activeFrontIds.includes(fleet.frontId)).map((fleet) => fleet.fleetId).sort((left, right) => String(left).localeCompare(String(right)))
  const projected = projectFleetOperationalLifecycle(lifecycle)
  const activeFleetIds = projected.assignments.filter((assignment) => assignment.active && assignment.assignment.shiftWorkspaceId === input.shiftWorkspaceId).map((assignment) => assignment.assignment.fleetId).sort((left, right) => String(left).localeCompare(String(right)))
  if (oldActiveFleetIds.join('|') !== activeFleetIds.join('|')) return lifecycleError('LEGACY_PROJECTION_MISMATCH', 'Legacy active Fleet identities do not match lifecycle projection')
  for (const fleet of input.fleetSetup.fleets) {
    const identity = identityByFleetId(lifecycle, fleet.fleetId, input.shiftWorkspaceId)
    const front = input.fleetSetup.fronts.find((candidate) => candidate.frontId === fleet.frontId)
    const projection = projected.assignments.find((assignment) => assignment.assignment.fleetId === fleet.fleetId)
    const effective = resolveEffectiveFleet(input.fleetSetup, fleet.fleetId)
    if (!effective.ok || !identity || !front || !projection || identity.frontId !== front.frontId || identity.haulerCode !== front.haulerCode || projection.effectiveConfiguration?.truckIds.join('|') !== effective.value.truckIds.join('|')) return lifecycleError('LEGACY_PROJECTION_MISMATCH', `Legacy Fleet ${fleet.fleetId} does not match lifecycle projection`)
  }
  return ok(undefined)
}
