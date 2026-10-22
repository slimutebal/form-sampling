import Dexie, { type Table } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { appendFrontContinuation } from '../../application/fleet-setup/append-front-continuation'
import type { Brand } from '../../domain/common/brand'
import type { EmployeeId, PileId, ShiftId } from '../../domain/common/identifiers'
import type { Result } from '../../domain/common/result'
import { addFleetDestination, deriveLegacyFleetOperationalLifecycle, type AddFleetDestinationCommand, type FleetAssignmentId, type FleetCommandId, type FleetDestinationAssignmentId, type FleetLifecycleValidationContext, type FleetOperationalEventId } from '../../domain/fleet/operational-lifecycle'
import { buildFixtureFleetSetup, buildFixtureHaulageTransaction, buildFixtureMasterData, buildFixtureProductionRecord, buildFixtureSapPile, buildFixtureShift, fixtureShiftId, FIXTURE_WRONG_TRUCK_TRUCK_ID } from './local-db-test-fixtures'
import { parseOreCode } from '../../domain/common/codes'
import { createMasterData } from '../../domain/master/master-data'
import { parsePileAreaCode } from '../../domain/master/master-codes'
import { createPileAreaReference } from '../../domain/master/references'
import type { HaulageTransactionRecord, ProductionRecordRecord, ShiftWorkspaceRecord } from './records'
import type {
  FleetCommandReceiptRecord,
  FleetConfigurationRevisionRecord,
  FleetDestinationAssignmentRecord,
  FleetLifecycleMigrationMarkerRecord,
  FleetOperationalAssignmentRecord,
  FleetOperationalEventRecord,
} from './fleet-lifecycle-records'
import { FleetLifecycleRepository, type FleetLifecycleDexieDatabase } from './fleet-lifecycle-repository'
import { FLEET_LIFECYCLE_SCHEMA_ACTIVATION_ENABLED, FLEET_LIFECYCLE_TABLE_SCHEMAS } from './fleet-lifecycle-schema'

function branded<T extends string>(value: string): Brand<string, T> { return value as Brand<string, T> }
function assignment(value: string): FleetAssignmentId { return branded<'FleetAssignmentId'>(value) }
function destination(value: string): FleetDestinationAssignmentId { return branded<'FleetDestinationAssignmentId'>(value) }
function event(value: string): FleetOperationalEventId { return branded<'FleetOperationalEventId'>(value) }
function command(value: string): FleetCommandId { return branded<'FleetCommandId'>(value) }
function pile(value: string): PileId { return branded<'PileId'>(value) }
function employee(value: string): EmployeeId { return branded<'EmployeeId'>(value) }
function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`invalid fixture: ${result.error.code}`)
  return result.value
}

class LifecycleTestDatabase extends Dexie implements FleetLifecycleDexieDatabase {
  readonly shiftWorkspaces!: Table<ShiftWorkspaceRecord, string>
  readonly haulageTransactions!: Table<HaulageTransactionRecord, string>
  readonly productionRecords!: Table<ProductionRecordRecord, string>
  readonly fleetOperationalAssignments!: Table<FleetOperationalAssignmentRecord, string>
  readonly fleetConfigurationRevisions!: Table<FleetConfigurationRevisionRecord, string>
  readonly fleetDestinationAssignments!: Table<FleetDestinationAssignmentRecord, string>
  readonly fleetOperationalEvents!: Table<FleetOperationalEventRecord, string>
  readonly fleetCommandReceipts!: Table<FleetCommandReceiptRecord, string>
  readonly fleetLifecycleMigrationMarkers!: Table<FleetLifecycleMigrationMarkerRecord, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      productionRecords: 'id, shiftId, pileId, [shiftId+pileId]',
      ...FLEET_LIFECYCLE_TABLE_SCHEMAS,
    })
  }
}

const names: string[] = []
function database(): LifecycleTestDatabase {
  const name = `fleet-lifecycle-phase-1-${Date.now()}-${Math.random().toString(36).slice(2)}`
  names.push(name)
  return new LifecycleTestDatabase(name)
}

afterEach(async () => {
  await Promise.all(names.splice(0, names.length).map((name) => Dexie.delete(name)))
})

async function seedWorkspace(db: LifecycleTestDatabase, shiftId: ShiftId = fixtureShiftId('SHIFT-1')): Promise<ShiftWorkspaceRecord> {
  const fixtureMasterData = buildFixtureMasterData()
  const masterData = must(createMasterData({
    ...fixtureMasterData,
    // This migration fixture gives the legacy Front a canonical Master Data
    // destination. Production fixtures deliberately remain pile-area-free.
    pileAreas: [createPileAreaReference(fixtureMasterData.sectors[0]!.code, must(parsePileAreaCode('STOCK-1')), pile('PILE-1'), must(parseOreCode('SAP')))],
  }))
  const workspace: ShiftWorkspaceRecord = {
    shiftId,
    shift: buildFixtureShift(shiftId as string),
    piles: [buildFixtureSapPile('PILE-1')],
    masterData,
    fleetSetup: buildFixtureFleetSetup(masterData, pile('PILE-1')),
  }
  await db.shiftWorkspaces.add(workspace)
  return workspace
}

async function seedWorkspaceWithDerivedFleet(db: LifecycleTestDatabase): Promise<ShiftWorkspaceRecord> {
  const workspace = await seedWorkspace(db)
  const continuation = must(appendFrontContinuation({
    fleetSetup: workspace.fleetSetup,
    masterData: workspace.masterData,
    referenceFrontId: 'F1',
    frontNumber: 2,
    fleetId: 'FLEET-B',
    addedTruckIds: [],
    removedTruckIds: [],
  }))
  const derivedWorkspace: ShiftWorkspaceRecord = { ...workspace, fleetSetup: continuation.fleetSetup }
  await db.shiftWorkspaces.put(derivedWorkspace)
  return derivedWorkspace
}

function lifecycleCommand(shiftWorkspaceId: ShiftId, overrides: Partial<AddFleetDestinationCommand> = {}): AddFleetDestinationCommand {
  return {
    commandId: command('CMD-ADD-1'), expectedAssignmentVersion: 1,
    occurredAt: new Date('2026-09-04T20:05:00+08:00'), recordedAt: new Date('2026-09-04T20:06:00+08:00'), actorId: employee('E-1'),
    assignmentId: assignment(`${shiftWorkspaceId}:legacy-assignment:FLEET-A`), destinationAssignmentId: destination('DEST-2'), eventId: event('EVENT-ADD-1'), pileId: pile('PILE-2'), ...overrides,
  }
}

const context: FleetLifecycleValidationContext = {
  shiftWindow: { shiftWorkspaceId: fixtureShiftId('SHIFT-1'), startsAt: new Date('2026-09-04T19:00:00+08:00'), endsAt: new Date('2026-09-05T07:00:00+08:00') },
}

describe('FleetLifecycleRepository — Phase 1 deferred persistence', () => {
  it('declares the required tables/indexes while automatic production activation remains disabled', () => {
    expect(FLEET_LIFECYCLE_SCHEMA_ACTIVATION_ENABLED).toBe(false)
    expect(FLEET_LIFECYCLE_TABLE_SCHEMAS.fleetOperationalAssignments).toContain('[shiftWorkspaceId+fleetId]')
    expect(FLEET_LIFECYCLE_TABLE_SCHEMAS.fleetCommandReceipts).toContain('[shiftWorkspaceId+commandId]')
  })

  it('migrates a BASE Fleet atomically and preserves the original FleetSetup', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const before = JSON.stringify(workspace.fleetSetup)
    const result = await new FleetLifecycleRepository(db).migrateLegacyWorkspace(workspace.shiftId)
    expect(result).toMatchObject({ ok: true, value: { status: 'MIGRATED' } })
    expect(await db.fleetOperationalAssignments.count()).toBe(1)
    expect(await db.fleetConfigurationRevisions.count()).toBe(1)
    expect(await db.fleetDestinationAssignments.count()).toBe(1)
    expect(await db.fleetLifecycleMigrationMarkers.get(workspace.shiftId)).toMatchObject({ status: 'COMPLETE', lifecycleVersion: 1 })
    expect(JSON.stringify((await db.shiftWorkspaces.get(workspace.shiftId))?.fleetSetup)).toBe(before)
  })

  it('keeps repeated migration deterministic and idempotent', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(workspace.shiftId)
    const replay = await repository.migrateLegacyWorkspace(workspace.shiftId)
    expect(replay).toMatchObject({ ok: true, value: { status: 'ALREADY_MIGRATED' } })
    expect(await db.fleetOperationalAssignments.count()).toBe(1)
    expect(await db.fleetConfigurationRevisions.count()).toBe(1)
  })

  it('keeps migration isolated by Shift Workspace even when Front Number repeats', async () => {
    const db = database(); const first = await seedWorkspace(db, fixtureShiftId('SHIFT-1')); const second = await seedWorkspace(db, fixtureShiftId('SHIFT-2')); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(first.shiftId); await repository.migrateLegacyWorkspace(second.shiftId)
    expect(await db.fleetOperationalAssignments.where('shiftWorkspaceId').equals(first.shiftId).count()).toBe(1)
    expect(await db.fleetOperationalAssignments.where('shiftWorkspaceId').equals(second.shiftId).count()).toBe(1)
  })

  it('migrates BASE/DERIVED lineage without changing which legacy Fleet is active', async () => {
    const db = database(); const workspace = await seedWorkspaceWithDerivedFleet(db)
    const result = await new FleetLifecycleRepository(db).migrateLegacyWorkspace(workspace.shiftId)
    expect(result).toMatchObject({ ok: true, value: { status: 'MIGRATED' } })
    if (!result.ok) throw new Error('expected lifecycle migration')
    const active = result.value.state.assignments.filter((candidate) => candidate.provenance === 'LEGACY_ACTIVE')
    const historical = result.value.state.assignments.filter((candidate) => candidate.provenance === 'LEGACY_HISTORICAL')
    expect(active.map((candidate) => candidate.fleetId)).toEqual(['FLEET-B'])
    expect(historical.map((candidate) => candidate.fleetId)).toEqual(['FLEET-A'])
    expect(result.value.state.identities.find((identity) => identity.fleetId === 'FLEET-B')).toMatchObject({ lineageRootFleetId: 'FLEET-A' })
  })

  it('rejects a partial lifecycle state without marking migration complete', async () => {
    const db = database(); const workspace = await seedWorkspace(db)
    const legacy = must(deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId: workspace.shiftId, fleetSetup: workspace.fleetSetup }))
    await db.fleetOperationalAssignments.add({ id: legacy.assignments[0].assignmentId as string, shiftWorkspaceId: workspace.shiftId, fleetId: legacy.assignments[0].fleetId, assignment: legacy.assignments[0] })
    const result = await new FleetLifecycleRepository(db).migrateLegacyWorkspace(workspace.shiftId)
    expect(result).toMatchObject({ ok: false, error: { code: 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE' } })
    expect(await db.fleetLifecycleMigrationMarkers.get(workspace.shiftId)).toBeUndefined()
  })

  it('rejects a completed marker whose legacy FleetSetup fingerprint changed', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(workspace.shiftId)
    await db.fleetLifecycleMigrationMarkers.update(workspace.shiftId, { legacyFingerprint: 'tampered' })
    expect(await repository.migrateLegacyWorkspace(workspace.shiftId)).toMatchObject({ ok: false, error: { code: 'FLEET_LIFECYCLE_MIGRATION_SOURCE_CHANGED' } })
  })

  it('rejects a completed marker whose persisted lifecycle no longer matches the legacy projection', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(workspace.shiftId)
    const row = await db.fleetOperationalAssignments.get(`${workspace.shiftId}:legacy-assignment:FLEET-A`)
    if (!row) throw new Error('expected migrated assignment')
    await db.fleetOperationalAssignments.update(row.id, { assignment: { ...row.assignment, provenance: 'LEGACY_HISTORICAL' } })
    expect(await repository.migrateLegacyWorkspace(workspace.shiftId)).toMatchObject({ ok: false, error: { code: 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE' } })
  })

  it('rolls back every lifecycle row and marker when one migration write fails', async () => {
    const db = database(); const workspace = await seedWorkspace(db)
    db.fleetConfigurationRevisions.hook('creating', () => { throw new Error('forced configuration write failure') })
    expect(await new FleetLifecycleRepository(db).migrateLegacyWorkspace(workspace.shiftId)).toMatchObject({ ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED' } })
    expect(await db.fleetOperationalAssignments.count()).toBe(0)
    expect(await db.fleetConfigurationRevisions.count()).toBe(0)
    expect(await db.fleetDestinationAssignments.count()).toBe(0)
    expect(await db.fleetLifecycleMigrationMarkers.get(workspace.shiftId)).toBeUndefined()
  })

  it('does not auto-migrate before the repository migration method is explicitly called', async () => {
    const db = database(); const workspace = await seedWorkspace(db)
    expect(await db.fleetOperationalAssignments.count()).toBe(0)
    expect(await db.fleetLifecycleMigrationMarkers.get(workspace.shiftId)).toBeUndefined()
    expect(await new FleetLifecycleRepository(db).readLifecycleReadiness(workspace.shiftId)).toMatchObject({ ok: true, value: { status: 'NOT_MIGRATED' } })
  })

  it('reports partial lifecycle rows as unavailable rather than verified', async () => {
    const db = database(); const workspace = await seedWorkspace(db)
    const legacy = must(deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId: workspace.shiftId, fleetSetup: workspace.fleetSetup }))
    await db.fleetOperationalAssignments.add({ id: legacy.assignments[0].assignmentId as string, shiftWorkspaceId: workspace.shiftId, fleetId: legacy.assignments[0].fleetId, assignment: legacy.assignments[0] })
    expect(await new FleetLifecycleRepository(db).readLifecycleReadiness(workspace.shiftId)).toMatchObject({ ok: true, value: { status: 'UNAVAILABLE', error: { code: 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE' } } })
  })

  it('reports lifecycle state as verified only after marker and equivalence checks pass', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(workspace.shiftId)
    expect(await repository.readLifecycleReadiness(workspace.shiftId)).toMatchObject({ ok: true, value: { status: 'VERIFIED', lifecycleState: { assignments: [{}] } } })
  })

  it('persists an append-only command, receipt, and event atomically after migration', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db); await repository.migrateLegacyWorkspace(workspace.shiftId)
    const payload = lifecycleCommand(workspace.shiftId)
    const result = await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })
    expect(result).toMatchObject({ ok: true, value: { status: 'APPLIED' } })
    expect(await db.fleetDestinationAssignments.count()).toBe(2)
    expect(await db.fleetOperationalEvents.count()).toBe(1)
    expect(await db.fleetCommandReceipts.count()).toBe(1)
    expect(await repository.readCommandReceipt(workspace.shiftId, 'CMD-ADD-1')).toMatchObject({ ok: true, value: { receipt: { commandId: 'CMD-ADD-1' } } })
  })

  it('replays the same commandId without duplicating history', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db); await repository.migrateLegacyWorkspace(workspace.shiftId)
    const payload = lifecycleCommand(workspace.shiftId)
    await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })
    const replay = await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })
    expect(replay).toMatchObject({ ok: true, value: { status: 'REPLAYED', receipt: { replayed: true } } })
    expect(await db.fleetOperationalEvents.count()).toBe(1)
  })

  it('rolls back all appended lifecycle rows when an event write fails', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db)
    await repository.migrateLegacyWorkspace(workspace.shiftId)
    db.fleetOperationalEvents.hook('creating', () => { throw new Error('forced event write failure') })
    const payload = lifecycleCommand(workspace.shiftId)
    expect(await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })).toMatchObject({ ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED' } })
    expect(await db.fleetDestinationAssignments.count()).toBe(1)
    expect(await db.fleetOperationalEvents.count()).toBe(0)
    expect(await db.fleetCommandReceipts.count()).toBe(0)
  })

  it('rejects a reused commandId with a different payload', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db); await repository.migrateLegacyWorkspace(workspace.shiftId)
    const original = lifecycleCommand(workspace.shiftId); const changed = lifecycleCommand(workspace.shiftId, { pileId: pile('PILE-3') })
    await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: original, apply: (state) => addFleetDestination(state, original, context) })
    expect(await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: changed, apply: (state) => addFleetDestination(state, changed, context) })).toMatchObject({ ok: false, error: { code: 'FLEET_COMMAND_IDEMPOTENCY_CONFLICT' } })
  })

  it('returns a reviewable stale-version proposal without persisting it', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db); await repository.migrateLegacyWorkspace(workspace.shiftId)
    const payload = lifecycleCommand(workspace.shiftId, { expectedAssignmentVersion: 0 })
    const result = await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })
    expect(result).toMatchObject({ ok: true, value: { status: 'REJECTED', error: { code: 'FLEET_ASSIGNMENT_STALE' }, proposal: { currentAssignmentVersion: 1 } } })
    expect(await db.fleetCommandReceipts.count()).toBe(0)
  })

  it('reads persisted assignment history and active projection', async () => {
    const db = database(); const workspace = await seedWorkspace(db); const repository = new FleetLifecycleRepository(db); await repository.migrateLegacyWorkspace(workspace.shiftId)
    const payload = lifecycleCommand(workspace.shiftId); await repository.appendCommand({ shiftWorkspaceId: workspace.shiftId, commandKind: 'ADD_DESTINATION', commandPayload: payload, apply: (state) => addFleetDestination(state, payload, context) })
    const active = await repository.readActiveAssignments(workspace.shiftId)
    expect(active).toMatchObject({ ok: true })
    const history = await repository.readAssignmentHistory(workspace.shiftId, `${workspace.shiftId}:legacy-assignment:FLEET-A`)
    expect(history).toMatchObject({ ok: true, value: { destinations: [{}, {}], events: [{}] } })
    expect(await repository.readConfigurationRevisions(workspace.shiftId, `${workspace.shiftId}:legacy-assignment:FLEET-A`)).toMatchObject({ ok: true, value: [{}] })
    expect(await repository.readActiveDestinations(workspace.shiftId, `${workspace.shiftId}:legacy-assignment:FLEET-A`)).toMatchObject({ ok: true, value: [{}, {}] })
    expect(await repository.readAuditEvents(workspace.shiftId, `${workspace.shiftId}:legacy-assignment:FLEET-A`)).toMatchObject({ ok: true, value: [{}] })
  })

  it('never rewrites historical ProductionRecord or Wrong Truck snapshots during migration', async () => {
    const db = database(); const workspace = await seedWorkspace(db)
    const transaction = buildFixtureHaulageTransaction({
      id: 'TX-1', shiftId: workspace.shiftId as string, pile: workspace.piles[0], batch: 1, rit: 1,
      masterData: workspace.masterData, fleetSetup: workspace.fleetSetup, truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
    })
    const productionRecord = buildFixtureProductionRecord({ transaction })
    await db.haulageTransactions.add({ id: transaction.id, shiftId: transaction.shiftId, pileId: transaction.pileId, transaction })
    await db.productionRecords.add({ id: transaction.id, shiftId: transaction.shiftId, pileId: transaction.pileId, productionRecord })
    const before = JSON.stringify({ transaction: await db.haulageTransactions.get(transaction.id), production: await db.productionRecords.get(transaction.id) })
    await new FleetLifecycleRepository(db).migrateLegacyWorkspace(workspace.shiftId)
    const after = JSON.stringify({ transaction: await db.haulageTransactions.get(transaction.id), production: await db.productionRecords.get(transaction.id) })
    expect(after).toBe(before)
    expect(transaction.truckValidation).toMatchObject({ status: 'WRONG_TRUCK' })
  })
})
