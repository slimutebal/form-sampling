/**
 * Deferred schema declaration for Fleet Operational Lifecycle Phase 1.
 *
 * This module is intentionally not imported by LocalOperationalDatabase.
 * Adding a Dexie version there would execute an upgrade on normal application
 * startup, which is prohibited until automated migration validation passes.
 */
export const FLEET_LIFECYCLE_SCHEMA_ACTIVATION_ENABLED = false

export const FLEET_LIFECYCLE_TABLE_SCHEMAS = {
  fleetOperationalAssignments: 'id, shiftWorkspaceId, fleetId, [shiftWorkspaceId+fleetId]',
  fleetConfigurationRevisions: 'id, shiftWorkspaceId, assignmentId, [assignmentId+revisionNumber], [shiftWorkspaceId+assignmentId]',
  fleetDestinationAssignments: 'id, shiftWorkspaceId, assignmentId, pileId, [shiftWorkspaceId+assignmentId], [shiftWorkspaceId+pileId]',
  fleetOperationalEvents: 'id, shiftWorkspaceId, assignmentId, commandId, occurredAt, [shiftWorkspaceId+assignmentId], [shiftWorkspaceId+commandId], [assignmentId+occurredAt]',
  fleetCommandReceipts: 'id, shiftWorkspaceId, commandId, &[shiftWorkspaceId+commandId]',
  fleetLifecycleMigrationMarkers: 'shiftWorkspaceId',
} as const

/** Future LocalOperationalDatabase version must use this unchanged declaration. */
export const FLEET_LIFECYCLE_SCHEMA_VERSION = 6
