import type { FleetId, ShiftId } from '../../domain/common/identifiers'
import type {
  FleetSuccessfulCommandReceipt,
  FleetConfigurationRevision,
  FleetDestinationAssignment,
  FleetOperationalAssignment,
  FleetOperationalEvent,
} from '../../domain/fleet/operational-lifecycle'

/**
 * Phase 1 record contracts. They are deliberately not added to the active
 * LocalOperationalDatabase schema yet; activation remains gated on executed
 * migration validation.
 */
export interface FleetOperationalAssignmentRecord {
  readonly id: string
  readonly shiftWorkspaceId: ShiftId
  readonly fleetId: FleetId
  readonly assignment: FleetOperationalAssignment
}

export interface FleetConfigurationRevisionRecord {
  readonly id: string
  readonly shiftWorkspaceId: ShiftId
  readonly assignmentId: string
  readonly revisionNumber: number
  readonly revision: FleetConfigurationRevision
}

export interface FleetDestinationAssignmentRecord {
  readonly id: string
  readonly shiftWorkspaceId: ShiftId
  readonly assignmentId: string
  readonly pileId: string
  readonly destination: FleetDestinationAssignment
}

export interface FleetOperationalEventRecord {
  readonly id: string
  readonly shiftWorkspaceId: ShiftId
  readonly assignmentId: string
  readonly commandId: string
  readonly occurredAt: Date
  readonly event: FleetOperationalEvent
}

export interface FleetCommandReceiptRecord {
  /** Scoped deterministic key: `${ShiftId}:${CommandId}`. */
  readonly id: string
  readonly shiftWorkspaceId: ShiftId
  readonly commandId: string
  readonly payloadFingerprint: string
  readonly receipt: FleetSuccessfulCommandReceipt
}

export interface FleetLifecycleMigrationMarkerRecord {
  readonly shiftWorkspaceId: ShiftId
  readonly lifecycleVersion: 1
  readonly legacyFingerprint: string
  readonly status: 'COMPLETE'
}
