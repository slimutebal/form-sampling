import Dexie, { type Table } from 'dexie'
import type { ShiftId } from '../../domain/common/identifiers'
import type { Result } from '../../domain/common/result'
import { err, ok } from '../../domain/common/result'
import {
  createFleetOperationalLifecycleState,
  createFleetRejectedCommandProposal,
  deriveLegacyFleetOperationalLifecycle,
  fingerprintFleetLifecycleCommandPayload,
  projectFleetOperationalLifecycle,
  validateLegacyProjectionEquivalence,
  type FleetLifecycleCommandKind,
  type FleetLifecycleCommandPayload,
  type FleetLifecycleError,
  type FleetLifecycleTransitionResult,
  type FleetOperationalLifecycleState,
  type FleetSuccessfulCommandReceipt,
} from '../../domain/fleet/operational-lifecycle'
import type { ShiftWorkspaceRecord } from './records'
import type {
  FleetCommandReceiptRecord,
  FleetConfigurationRevisionRecord,
  FleetDestinationAssignmentRecord,
  FleetLifecycleMigrationMarkerRecord,
  FleetOperationalAssignmentRecord,
  FleetOperationalEventRecord,
} from './fleet-lifecycle-records'

export interface FleetLifecycleDexieDatabase extends Dexie {
  readonly shiftWorkspaces: Table<ShiftWorkspaceRecord, string>
  readonly fleetOperationalAssignments: Table<FleetOperationalAssignmentRecord, string>
  readonly fleetConfigurationRevisions: Table<FleetConfigurationRevisionRecord, string>
  readonly fleetDestinationAssignments: Table<FleetDestinationAssignmentRecord, string>
  readonly fleetOperationalEvents: Table<FleetOperationalEventRecord, string>
  readonly fleetCommandReceipts: Table<FleetCommandReceiptRecord, string>
  readonly fleetLifecycleMigrationMarkers: Table<FleetLifecycleMigrationMarkerRecord, string>
}

export interface FleetLifecyclePersistenceError {
  readonly code:
    | 'SHIFT_WORKSPACE_NOT_FOUND'
    | 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE'
    | 'FLEET_LIFECYCLE_MIGRATION_SOURCE_CHANGED'
    | 'FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE'
    | 'FLEET_LIFECYCLE_NOT_MIGRATED'
    | 'FLEET_ASSIGNMENT_STALE'
    | 'FLEET_COMMAND_IDEMPOTENCY_CONFLICT'
    | 'FLEET_LIFECYCLE_STATE_INVALID'
    | 'LOCAL_DATABASE_OPERATION_FAILED'
  readonly message: string
}

/** Read-only source status for the Phase 2 projection adapter. */
export type FleetLifecycleReadiness =
  | {
      readonly status: 'VERIFIED'
      readonly workspace: ShiftWorkspaceRecord
      readonly lifecycleState: FleetOperationalLifecycleState
    }
  | {
      readonly status: 'NOT_MIGRATED'
      readonly workspace: ShiftWorkspaceRecord
    }
  | {
      readonly status: 'UNAVAILABLE'
      readonly workspace: ShiftWorkspaceRecord
      readonly error: FleetLifecyclePersistenceError
    }

export type FleetLifecycleMigrationResult =
  | { readonly status: 'MIGRATED'; readonly state: FleetOperationalLifecycleState }
  | { readonly status: 'ALREADY_MIGRATED'; readonly state: FleetOperationalLifecycleState }

export type FleetLifecycleAppendResult =
  | { readonly status: 'APPLIED'; readonly transition: FleetLifecycleTransitionResult }
  | { readonly status: 'REPLAYED'; readonly receipt: FleetSuccessfulCommandReceipt; readonly state: FleetOperationalLifecycleState }
  | {
      readonly status: 'REJECTED'
      readonly proposal: ReturnType<typeof createFleetRejectedCommandProposal>
      readonly error: FleetLifecyclePersistenceError
    }

export interface AppendFleetLifecycleCommandParams<TPayload extends FleetLifecycleCommandPayload> {
  readonly shiftWorkspaceId: ShiftId
  readonly commandKind: FleetLifecycleCommandKind
  readonly commandPayload: TPayload
  /** The repository calls this only after loading state in its RW transaction. */
  readonly apply: (state: FleetOperationalLifecycleState) => Result<FleetLifecycleTransitionResult, FleetLifecycleError>
}

class ExpectedFleetLifecyclePersistenceError extends Error {
  readonly persistenceError: FleetLifecyclePersistenceError

  constructor(persistenceError: FleetLifecyclePersistenceError) {
    super(persistenceError.message)
    this.persistenceError = persistenceError
  }
}

function abort(code: FleetLifecyclePersistenceError['code'], message: string): never {
  throw new ExpectedFleetLifecyclePersistenceError({ code, message })
}

function mapCaughtError(caught: unknown): FleetLifecyclePersistenceError {
  if (caught instanceof ExpectedFleetLifecyclePersistenceError) return caught.persistenceError
  return {
    code: 'LOCAL_DATABASE_OPERATION_FAILED',
    message: caught instanceof Error ? caught.message : 'Unexpected Fleet lifecycle database operation failure',
  }
}

function toPersistenceDomainError(error: FleetLifecycleError): FleetLifecyclePersistenceError {
  return {
    code: error.code === 'ASSIGNMENT_VERSION_STALE' ? 'FLEET_ASSIGNMENT_STALE' : 'FLEET_LIFECYCLE_STATE_INVALID',
    message: error.message,
  }
}

function receiptRecordId(shiftWorkspaceId: ShiftId, commandId: string): string {
  return `${shiftWorkspaceId}:${commandId}`
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() }
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stableValue(nested)]))
  }
  return value
}

/** Deterministic, non-cryptographic source fingerprint used only for idempotency/equivalence gating. */
export function fingerprintLegacyFleetSetup(workspace: ShiftWorkspaceRecord): string {
  return JSON.stringify(stableValue({
    shiftId: workspace.shiftId,
    fronts: workspace.fleetSetup.fronts,
    fleets: workspace.fleetSetup.fleets,
  }))
}

function assignmentRecord(shiftWorkspaceId: ShiftId, assignment: FleetOperationalLifecycleState['assignments'][number]): FleetOperationalAssignmentRecord {
  return { id: assignment.assignmentId as string, shiftWorkspaceId, fleetId: assignment.fleetId, assignment }
}

function revisionRecord(shiftWorkspaceId: ShiftId, revision: FleetOperationalLifecycleState['configurationRevisions'][number]): FleetConfigurationRevisionRecord {
  return { id: revision.revisionId as string, shiftWorkspaceId, assignmentId: revision.assignmentId as string, revisionNumber: revision.revisionNumber, revision }
}

function destinationRecord(shiftWorkspaceId: ShiftId, destination: FleetOperationalLifecycleState['destinationAssignments'][number]): FleetDestinationAssignmentRecord {
  return { id: destination.destinationAssignmentId as string, shiftWorkspaceId, assignmentId: destination.assignmentId as string, pileId: destination.pileId as string, destination }
}

function eventRecord(shiftWorkspaceId: ShiftId, event: FleetOperationalLifecycleState['events'][number]): FleetOperationalEventRecord {
  return { id: event.eventId as string, shiftWorkspaceId, assignmentId: event.assignmentId as string, commandId: event.commandId as string, occurredAt: event.occurredAt, event }
}

function receiptRecord(shiftWorkspaceId: ShiftId, receipt: FleetSuccessfulCommandReceipt, payloadFingerprint: string): FleetCommandReceiptRecord {
  return { id: receiptRecordId(shiftWorkspaceId, receipt.commandId as string), shiftWorkspaceId, commandId: receipt.commandId as string, payloadFingerprint, receipt }
}

async function lifecycleStateForWorkspace(db: FleetLifecycleDexieDatabase, shiftWorkspaceId: ShiftId): Promise<Result<FleetOperationalLifecycleState, FleetLifecyclePersistenceError>> {
  const [assignmentRows, revisionRows, destinationRows, eventRows, receiptRows] = await Promise.all([
    db.fleetOperationalAssignments.where('shiftWorkspaceId').equals(shiftWorkspaceId).toArray(),
    db.fleetConfigurationRevisions.where('shiftWorkspaceId').equals(shiftWorkspaceId).toArray(),
    db.fleetDestinationAssignments.where('shiftWorkspaceId').equals(shiftWorkspaceId).toArray(),
    db.fleetOperationalEvents.where('shiftWorkspaceId').equals(shiftWorkspaceId).toArray(),
    db.fleetCommandReceipts.where('shiftWorkspaceId').equals(shiftWorkspaceId).toArray(),
  ])
  const workspace = await db.shiftWorkspaces.get(shiftWorkspaceId)
  if (!workspace) return err({ code: 'SHIFT_WORKSPACE_NOT_FOUND', message: `No Shift Workspace exists for ${shiftWorkspaceId}` })
  const legacy = deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId, fleetSetup: workspace.fleetSetup })
  if (!legacy.ok) return err({ code: 'FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', message: legacy.error.message })
  const state = createFleetOperationalLifecycleState({
    identities: legacy.value.identities,
    assignments: assignmentRows.map((row) => row.assignment),
    configurationRevisions: revisionRows.map((row) => row.revision),
    destinationAssignments: destinationRows.map((row) => row.destination),
    events: eventRows.map((row) => row.event),
    commandReceipts: receiptRows.map((row) => row.receipt),
  })
  return state.ok ? ok(state.value) : err(toPersistenceDomainError(state.error))
}

async function lifecycleRowCounts(db: FleetLifecycleDexieDatabase, shiftWorkspaceId: ShiftId): Promise<readonly number[]> {
  return Promise.all([
    db.fleetOperationalAssignments.where('shiftWorkspaceId').equals(shiftWorkspaceId).count(),
    db.fleetConfigurationRevisions.where('shiftWorkspaceId').equals(shiftWorkspaceId).count(),
    db.fleetDestinationAssignments.where('shiftWorkspaceId').equals(shiftWorkspaceId).count(),
    db.fleetOperationalEvents.where('shiftWorkspaceId').equals(shiftWorkspaceId).count(),
    db.fleetCommandReceipts.where('shiftWorkspaceId').equals(shiftWorkspaceId).count(),
  ])
}

/**
 * Deferred repository. It is fully testable with a dedicated Dexie test schema,
 * but is not constructed by LocalOperationalStore while schema activation is
 * gated. FleetIdentity is reconstructed from the unchanged static FleetSetup;
 * no Company ownership is fabricated from lifecycle rows.
 */
export class FleetLifecycleRepository {
  private readonly db: FleetLifecycleDexieDatabase

  constructor(db: FleetLifecycleDexieDatabase) {
    this.db = db
  }

  async readLifecycleState(shiftWorkspaceId: ShiftId): Promise<Result<FleetOperationalLifecycleState, FleetLifecyclePersistenceError>> {
    try {
      return await lifecycleStateForWorkspace(this.db, shiftWorkspaceId)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Does not migrate. Consumers must use this status before considering a
   * lifecycle projection authoritative; direct raw state reads are insufficient
   * when rows exist without a completed marker.
   */
  async readLifecycleReadiness(shiftWorkspaceId: ShiftId): Promise<Result<FleetLifecycleReadiness, FleetLifecyclePersistenceError>> {
    try {
      return await this.db.transaction(
        'r',
        [
          this.db.shiftWorkspaces,
          this.db.fleetOperationalAssignments,
          this.db.fleetConfigurationRevisions,
          this.db.fleetDestinationAssignments,
          this.db.fleetOperationalEvents,
          this.db.fleetCommandReceipts,
          this.db.fleetLifecycleMigrationMarkers,
        ],
        async () => {
          const workspace = await this.db.shiftWorkspaces.get(shiftWorkspaceId)
          if (!workspace) return err({ code: 'SHIFT_WORKSPACE_NOT_FOUND', message: `No Shift Workspace exists for ${shiftWorkspaceId}` })
          const marker = await this.db.fleetLifecycleMigrationMarkers.get(shiftWorkspaceId)
          if (!marker) {
            const rowCounts = await lifecycleRowCounts(this.db, shiftWorkspaceId)
            return rowCounts.some((count) => count > 0)
              ? ok({
                  status: 'UNAVAILABLE',
                  workspace,
                  error: {
                    code: 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE',
                    message: 'Lifecycle rows exist without a completed migration marker',
                  },
                })
              : ok({ status: 'NOT_MIGRATED', workspace })
          }
          if (marker.legacyFingerprint !== fingerprintLegacyFleetSetup(workspace)) {
            return ok({
              status: 'UNAVAILABLE',
              workspace,
              error: {
                code: 'FLEET_LIFECYCLE_MIGRATION_SOURCE_CHANGED',
                message: 'Legacy FleetSetup changed after lifecycle migration',
              },
            })
          }
          const lifecycleState = await lifecycleStateForWorkspace(this.db, shiftWorkspaceId)
          if (!lifecycleState.ok) return ok({ status: 'UNAVAILABLE', workspace, error: lifecycleState.error })
          const equivalent = validateLegacyProjectionEquivalence(
            { shiftWorkspaceId, fleetSetup: workspace.fleetSetup },
            lifecycleState.value,
          )
          if (!equivalent.ok) {
            return ok({
              status: 'UNAVAILABLE',
              workspace,
              error: { code: 'FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', message: equivalent.error.message },
            })
          }
          return ok({ status: 'VERIFIED', workspace, lifecycleState: lifecycleState.value })
        },
      )
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  async readActiveAssignments(shiftWorkspaceId: ShiftId): Promise<Result<ReturnType<typeof projectFleetOperationalLifecycle>['assignments'], FleetLifecyclePersistenceError>> {
    const state = await this.readLifecycleState(shiftWorkspaceId)
    if (!state.ok) return err(state.error)
    return ok(projectFleetOperationalLifecycle(state.value).assignments.filter((assignment) => assignment.active))
  }

  async readAssignmentHistory(shiftWorkspaceId: ShiftId, assignmentId: string): Promise<Result<{
    readonly revisions: readonly FleetConfigurationRevisionRecord[]
    readonly destinations: readonly FleetDestinationAssignmentRecord[]
    readonly events: readonly FleetOperationalEventRecord[]
  }, FleetLifecyclePersistenceError>> {
    try {
      const [revisions, destinations, events] = await Promise.all([
        this.db.fleetConfigurationRevisions.where('[shiftWorkspaceId+assignmentId]').equals([shiftWorkspaceId, assignmentId]).toArray(),
        this.db.fleetDestinationAssignments.where('[shiftWorkspaceId+assignmentId]').equals([shiftWorkspaceId, assignmentId]).toArray(),
        this.db.fleetOperationalEvents.where('[shiftWorkspaceId+assignmentId]').equals([shiftWorkspaceId, assignmentId]).toArray(),
      ])
      return ok({
        revisions: revisions.sort((left, right) => left.revisionNumber - right.revisionNumber),
        destinations,
        events: events.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()),
      })
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  async readConfigurationRevisions(shiftWorkspaceId: ShiftId, assignmentId: string): Promise<Result<readonly FleetConfigurationRevisionRecord[], FleetLifecyclePersistenceError>> {
    const history = await this.readAssignmentHistory(shiftWorkspaceId, assignmentId)
    return history.ok ? ok(history.value.revisions) : err(history.error)
  }

  async readActiveDestinations(shiftWorkspaceId: ShiftId, assignmentId: string): Promise<Result<readonly FleetDestinationAssignmentRecord[], FleetLifecyclePersistenceError>> {
    const state = await this.readLifecycleState(shiftWorkspaceId)
    if (!state.ok) return err(state.error)
    const projection = projectFleetOperationalLifecycle(state.value).assignments.find(
      (candidate) => candidate.assignment.assignmentId === assignmentId,
    )
    return ok((projection?.activeDestinations ?? []).map((destination) => destinationRecord(shiftWorkspaceId, destination)))
  }

  async readAuditEvents(shiftWorkspaceId: ShiftId, assignmentId: string): Promise<Result<readonly FleetOperationalEventRecord[], FleetLifecyclePersistenceError>> {
    const history = await this.readAssignmentHistory(shiftWorkspaceId, assignmentId)
    return history.ok ? ok(history.value.events) : err(history.error)
  }

  async readCommandReceipt(shiftWorkspaceId: ShiftId, commandId: string): Promise<Result<FleetCommandReceiptRecord | undefined, FleetLifecyclePersistenceError>> {
    try {
      return ok(await this.db.fleetCommandReceipts.get(receiptRecordId(shiftWorkspaceId, commandId)))
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  async migrateLegacyWorkspace(shiftWorkspaceId: ShiftId): Promise<Result<FleetLifecycleMigrationResult, FleetLifecyclePersistenceError>> {
    try {
      return await this.db.transaction(
        'rw',
        [
          this.db.shiftWorkspaces,
          this.db.fleetOperationalAssignments,
          this.db.fleetConfigurationRevisions,
          this.db.fleetDestinationAssignments,
          this.db.fleetOperationalEvents,
          this.db.fleetCommandReceipts,
          this.db.fleetLifecycleMigrationMarkers,
        ],
        async () => {
          const workspace = await this.db.shiftWorkspaces.get(shiftWorkspaceId)
          if (!workspace) abort('SHIFT_WORKSPACE_NOT_FOUND', `No Shift Workspace exists for ${shiftWorkspaceId}`)
          const fingerprint = fingerprintLegacyFleetSetup(workspace)
          const marker = await this.db.fleetLifecycleMigrationMarkers.get(shiftWorkspaceId)
          if (marker) {
            if (marker.legacyFingerprint !== fingerprint) abort('FLEET_LIFECYCLE_MIGRATION_SOURCE_CHANGED', 'Legacy FleetSetup changed after lifecycle migration')
            const state = await this.readMigratedStateWithinTransaction(shiftWorkspaceId, workspace)
            return ok({ status: 'ALREADY_MIGRATED', state })
          }
          const partialRowCounts = await lifecycleRowCounts(this.db, shiftWorkspaceId)
          if (partialRowCounts.some((count) => count > 0)) {
            abort('FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE', 'Lifecycle rows exist without a completed migration marker')
          }
          const lifecycle = deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId, fleetSetup: workspace.fleetSetup })
          if (!lifecycle.ok) abort('FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', lifecycle.error.message)
          const equivalence = validateLegacyProjectionEquivalence({ shiftWorkspaceId, fleetSetup: workspace.fleetSetup }, lifecycle.value)
          if (!equivalence.ok) abort('FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', equivalence.error.message)
          await this.writeWholeLegacyState(shiftWorkspaceId, lifecycle.value, fingerprint)
          return ok({ status: 'MIGRATED', state: lifecycle.value })
        },
      )
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  private async writeWholeLegacyState(shiftWorkspaceId: ShiftId, state: FleetOperationalLifecycleState, fingerprint: string): Promise<void> {
    await this.db.fleetOperationalAssignments.bulkAdd(state.assignments.map((assignment) => assignmentRecord(shiftWorkspaceId, assignment)))
    await this.db.fleetConfigurationRevisions.bulkAdd(state.configurationRevisions.map((revision) => revisionRecord(shiftWorkspaceId, revision)))
    await this.db.fleetDestinationAssignments.bulkAdd(state.destinationAssignments.map((destination) => destinationRecord(shiftWorkspaceId, destination)))
    await this.db.fleetLifecycleMigrationMarkers.add({ shiftWorkspaceId, lifecycleVersion: 1, legacyFingerprint: fingerprint, status: 'COMPLETE' })
  }

  private async readMigratedStateWithinTransaction(shiftWorkspaceId: ShiftId, workspace: ShiftWorkspaceRecord): Promise<FleetOperationalLifecycleState> {
    const regenerated = deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId, fleetSetup: workspace.fleetSetup })
    if (!regenerated.ok) abort('FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', regenerated.error.message)
    const persisted = await lifecycleStateForWorkspace(this.db, shiftWorkspaceId)
    if (!persisted.ok) abort(persisted.error.code, persisted.error.message)
    const equivalence = validateLegacyProjectionEquivalence({ shiftWorkspaceId, fleetSetup: workspace.fleetSetup }, persisted.value)
    if (!equivalence.ok || persisted.value.assignments.length !== regenerated.value.assignments.length || persisted.value.configurationRevisions.length !== regenerated.value.configurationRevisions.length || persisted.value.destinationAssignments.length !== regenerated.value.destinationAssignments.length) {
      abort('FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE', 'Completed migration lifecycle rows are incomplete or no longer equivalent')
    }
    return persisted.value
  }

  async appendCommand<TPayload extends FleetLifecycleCommandPayload>(
    params: AppendFleetLifecycleCommandParams<TPayload>,
  ): Promise<Result<FleetLifecycleAppendResult, FleetLifecyclePersistenceError>> {
    try {
      return await this.db.transaction(
        'rw',
        [
          this.db.shiftWorkspaces,
          this.db.fleetOperationalAssignments,
          this.db.fleetConfigurationRevisions,
          this.db.fleetDestinationAssignments,
          this.db.fleetOperationalEvents,
          this.db.fleetCommandReceipts,
          this.db.fleetLifecycleMigrationMarkers,
        ],
        async () => {
          const marker = await this.db.fleetLifecycleMigrationMarkers.get(params.shiftWorkspaceId)
          if (!marker) abort('FLEET_LIFECYCLE_NOT_MIGRATED', 'Lifecycle commands are unavailable until a verified migration is complete')
          const payloadFingerprint = fingerprintFleetLifecycleCommandPayload(params.commandPayload)
          const priorReceipt = await this.db.fleetCommandReceipts.get(receiptRecordId(params.shiftWorkspaceId, params.commandPayload.commandId as string))
          if (priorReceipt) {
            if (priorReceipt.payloadFingerprint !== payloadFingerprint) abort('FLEET_COMMAND_IDEMPOTENCY_CONFLICT', 'The commandId was already used with a different payload')
            const state = await lifecycleStateForWorkspace(this.db, params.shiftWorkspaceId)
            if (!state.ok) abort(state.error.code, state.error.message)
            return ok({ status: 'REPLAYED', receipt: { ...priorReceipt.receipt, replayed: true }, state: state.value })
          }
          const current = await lifecycleStateForWorkspace(this.db, params.shiftWorkspaceId)
          if (!current.ok) abort(current.error.code, current.error.message)
          const transition = params.apply(current.value)
          if (!transition.ok) {
            return ok({
              status: 'REJECTED',
              proposal: createFleetRejectedCommandProposal(params.commandKind, params.commandPayload, transition.error, current.value),
              error: toPersistenceDomainError(transition.error),
            })
          }
          const immutable = ensureAppendOnly(current.value, transition.value.state)
          if (!immutable.ok) abort(immutable.error.code, immutable.error.message)
          await this.appendTransitionRows(params.shiftWorkspaceId, current.value, transition.value, payloadFingerprint)
          return ok({ status: 'APPLIED', transition: transition.value })
        },
      )
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  private async appendTransitionRows(
    shiftWorkspaceId: ShiftId,
    current: FleetOperationalLifecycleState,
    transition: FleetLifecycleTransitionResult,
    payloadFingerprint: string,
  ): Promise<void> {
    const assignmentIds = new Set(current.assignments.map((assignment) => assignment.assignmentId as string))
    const revisionIds = new Set(current.configurationRevisions.map((revision) => revision.revisionId as string))
    const destinationIds = new Set(current.destinationAssignments.map((destination) => destination.destinationAssignmentId as string))
    const eventIds = new Set(current.events.map((event) => event.eventId as string))
    await this.db.fleetOperationalAssignments.bulkAdd(transition.state.assignments.filter((assignment) => !assignmentIds.has(assignment.assignmentId as string)).map((assignment) => assignmentRecord(shiftWorkspaceId, assignment)))
    await this.db.fleetConfigurationRevisions.bulkAdd(transition.state.configurationRevisions.filter((revision) => !revisionIds.has(revision.revisionId as string)).map((revision) => revisionRecord(shiftWorkspaceId, revision)))
    await this.db.fleetDestinationAssignments.bulkAdd(transition.state.destinationAssignments.filter((destination) => !destinationIds.has(destination.destinationAssignmentId as string)).map((destination) => destinationRecord(shiftWorkspaceId, destination)))
    await this.db.fleetOperationalEvents.bulkAdd(transition.state.events.filter((event) => !eventIds.has(event.eventId as string)).map((event) => eventRecord(shiftWorkspaceId, event)))
    await this.db.fleetCommandReceipts.add(receiptRecord(shiftWorkspaceId, transition.receipt, payloadFingerprint))
  }
}

function ensureAppendOnly(current: FleetOperationalLifecycleState, next: FleetOperationalLifecycleState): Result<void, FleetLifecyclePersistenceError> {
  const unchanged = <T>(before: readonly T[], after: readonly T[], id: (value: T) => string): boolean =>
    before.every((value) => {
      const candidate = after.find((nextValue) => id(nextValue) === id(value))
      return candidate !== undefined && JSON.stringify(candidate) === JSON.stringify(value)
    })
  if (!unchanged(current.assignments, next.assignments, (assignment) => assignment.assignmentId as string) || !unchanged(current.configurationRevisions, next.configurationRevisions, (revision) => revision.revisionId as string) || !unchanged(current.destinationAssignments, next.destinationAssignments, (destination) => destination.destinationAssignmentId as string) || !unchanged(current.events, next.events, (event) => event.eventId as string)) {
    return err({ code: 'FLEET_LIFECYCLE_STATE_INVALID', message: 'Lifecycle transitions may append history but may not rewrite it' })
  }
  return ok(undefined)
}
