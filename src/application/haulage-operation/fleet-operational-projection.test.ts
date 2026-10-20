import { describe, expect, it } from 'vitest'
import type { Brand } from '@/domain/common/brand'
import type { EmployeeId, FleetId, FrontId, PileId, ShiftId, TruckId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import {
  addFleetDestination,
  createFleetOperationalLifecycleState,
  deriveLegacyFleetOperationalLifecycle,
  reactivateFleetAssignment,
  redirectFleetDestination,
  transferFleetAssignment,
  type AddFleetDestinationCommand,
  type FleetAssignmentId,
  type FleetCommandId,
  type FleetConfigurationRevisionId,
  type FleetDestinationAssignmentId,
  type FleetLifecycleValidationContext,
  type FleetConfigurationRevision,
  type FleetDestinationAssignment,
  type FleetIdentity,
  type FleetOperationalAssignment,
  type FleetOperationalEventId,
  type FleetOperationalLifecycleState,
  type ReactivateFleetAssignmentCommand,
  type RedirectFleetDestinationCommand,
  type TransferFleetAssignmentCommand,
} from '@/domain/fleet/operational-lifecycle'
import { appendFrontContinuation } from '@/application/fleet-setup/append-front-continuation'
import { buildFixtureFleetSetup, buildFixtureMasterData, fixtureShiftId } from '@/test/fixtures/haulage-operation-test-fixtures'
import {
  activeDestinationsForAssignment,
  activeFleetsForPile,
  activeFleetsForPileTruck,
  effectiveExcaForAssignment,
  eligibleTruckIdsForPile,
  historicalAssignments,
  lifecycleProjectionUnavailableReason,
  selectFleetOperationalProjection,
  type ReadyFleetOperationalProjection,
} from './fleet-operational-projection'

function branded<T extends string>(value: string): Brand<string, T> { return value as Brand<string, T> }
function shift(value: string): ShiftId { return branded<'ShiftId'>(value) }
function fleet(value: string): FleetId { return branded<'FleetId'>(value) }
function front(value: string): FrontId { return branded<'FrontId'>(value) }
function pile(value: string): PileId { return branded<'PileId'>(value) }
function truck(value: string): TruckId { return branded<'TruckId'>(value) }
function employee(value: string): EmployeeId { return branded<'EmployeeId'>(value) }
function assignment(value: string): FleetAssignmentId { return branded<'FleetAssignmentId'>(value) }
function revision(value: string): FleetConfigurationRevisionId { return branded<'FleetConfigurationRevisionId'>(value) }
function destination(value: string): FleetDestinationAssignmentId { return branded<'FleetDestinationAssignmentId'>(value) }
function event(value: string): FleetOperationalEventId { return branded<'FleetOperationalEventId'>(value) }
function command(value: string): FleetCommandId { return branded<'FleetCommandId'>(value) }
function must<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value
}

const workspace = shift('SHIFT-1')
const operator = employee('E-1')
const time = new Date('2026-09-04T20:00:00+08:00')
const context: FleetLifecycleValidationContext = {
  shiftWindow: { shiftWorkspaceId: workspace, startsAt: new Date('2026-09-04T19:00:00+08:00'), endsAt: new Date('2026-09-05T07:00:00+08:00') },
  isPileEligibleForCompany: (pileId, company) => company === 'H1' || pileId !== pile('S5_02'),
}

function state(options: { readonly independent?: boolean; readonly crossCompany?: boolean } = {}): FleetOperationalLifecycleState {
  const identities: FleetIdentity[] = [
    { shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), haulerCode: branded<'HaulerCode'>('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
    { shiftWorkspaceId: workspace, fleetId: fleet('F2'), frontId: front('BR1/02'), haulerCode: branded<'HaulerCode'>('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
    { shiftWorkspaceId: workspace, fleetId: fleet('F3'), frontId: front('BR1/03'), haulerCode: branded<'HaulerCode'>('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
  ]
  const assignments: FleetOperationalAssignment[] = [{ assignmentId: assignment('A1'), shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), lineageRootFleetId: fleet('F1'), activatedAt: time, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 }]
  const revisions: FleetConfigurationRevision[] = [{ revisionId: revision('R1'), assignmentId: assignment('A1'), revisionNumber: 1, effectiveAt: time, excaCode: branded<'ExcaCode'>('EX-1'), truckIds: [truck('T1')], createdBy: operator, reason: 'ACTIVATED' }]
  const destinations: FleetDestinationAssignment[] = [{ destinationAssignmentId: destination('D1'), assignmentId: assignment('A1'), pileId: pile('S5_01'), openedAt: time, openedBy: operator }]
  if (options.independent) {
    identities.push({ shiftWorkspaceId: workspace, fleetId: fleet('F9'), frontId: front('BR1/09'), haulerCode: branded<'HaulerCode'>('H1'), lineageRootFleetId: fleet('F9'), provenance: 'OPERATOR' })
    assignments.push({ assignmentId: assignment('A9'), shiftWorkspaceId: workspace, fleetId: fleet('F9'), frontId: front('BR1/09'), lineageRootFleetId: fleet('F9'), activatedAt: time, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 })
    revisions.push({ revisionId: revision('R9'), assignmentId: assignment('A9'), revisionNumber: 1, effectiveAt: time, truckIds: [truck('T1')], createdBy: operator, reason: 'ACTIVATED' })
    destinations.push({ destinationAssignmentId: destination('D9'), assignmentId: assignment('A9'), pileId: pile('S5_01'), openedAt: time, openedBy: operator })
  }
  if (options.crossCompany) {
    identities.push({ shiftWorkspaceId: workspace, fleetId: fleet('FH2'), frontId: front('BR2/01'), haulerCode: branded<'HaulerCode'>('H2'), lineageRootFleetId: fleet('FH2'), provenance: 'OPERATOR' })
    assignments.push({ assignmentId: assignment('AH2'), shiftWorkspaceId: workspace, fleetId: fleet('FH2'), frontId: front('BR2/01'), lineageRootFleetId: fleet('FH2'), activatedAt: time, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 })
    revisions.push({ revisionId: revision('RH2'), assignmentId: assignment('AH2'), revisionNumber: 1, effectiveAt: time, truckIds: [truck('T2')], createdBy: operator, reason: 'ACTIVATED' })
    destinations.push({ destinationAssignmentId: destination('DH2'), assignmentId: assignment('AH2'), pileId: pile('S5_02'), openedAt: time, openedBy: operator })
  }
  return must(createFleetOperationalLifecycleState({ identities, assignments, configurationRevisions: revisions, destinationAssignments: destinations, events: [], commandReceipts: [] }))
}

function addCommand(overrides: Partial<AddFleetDestinationCommand> = {}): AddFleetDestinationCommand {
  return { commandId: command('ADD'), expectedAssignmentVersion: 1, occurredAt: new Date('2026-09-04T20:05:00+08:00'), recordedAt: new Date('2026-09-04T20:06:00+08:00'), actorId: operator, assignmentId: assignment('A1'), destinationAssignmentId: destination('D2'), eventId: event('E-ADD'), pileId: pile('S5_02'), ...overrides }
}

function redirectCommand(): RedirectFleetDestinationCommand {
  return { commandId: command('REDIRECT'), expectedAssignmentVersion: 1, occurredAt: new Date('2026-09-04T20:05:00+08:00'), recordedAt: new Date('2026-09-04T20:06:00+08:00'), actorId: operator, assignmentId: assignment('A1'), closedDestinationAssignmentId: destination('D1'), openedDestinationAssignmentId: destination('D3'), eventId: event('E-REDIRECT'), destinationPileId: pile('S5_03') }
}

function transferCommand(overrides: Partial<TransferFleetAssignmentCommand> = {}): TransferFleetAssignmentCommand {
  return { commandId: command('TRANSFER'), expectedAssignmentVersion: 1, occurredAt: new Date('2026-09-04T20:05:00+08:00'), recordedAt: new Date('2026-09-04T20:06:00+08:00'), actorId: operator, replacementAssignmentId: assignment('A1'), newAssignmentId: assignment('A2'), activationEventId: event('E-A2'), closureEventId: event('E-C1'), configurationRevisionId: revision('R2'), destinationAssignments: [{ destinationAssignmentId: destination('D2'), pileId: pile('S5_02') }], truckIds: [truck('T1')], targetFleetId: fleet('F2'), ...overrides }
}

function reactivateCommand(overrides: Partial<ReactivateFleetAssignmentCommand> = {}): ReactivateFleetAssignmentCommand {
  return { commandId: command('REACTIVATE'), expectedAssignmentVersion: 1, occurredAt: new Date('2026-09-04T20:10:00+08:00'), recordedAt: new Date('2026-09-04T20:11:00+08:00'), actorId: operator, replacementAssignmentId: assignment('A2'), newAssignmentId: assignment('A3'), activationEventId: event('E-A3'), closureEventId: event('E-C2'), configurationRevisionId: revision('R3'), destinationAssignments: [{ destinationAssignmentId: destination('D3'), pileId: pile('S5_03') }], truckIds: [truck('T1')], reactivatedFleetId: fleet('F1'), ...overrides }
}

function lifecycleProjection(lifecycleState: FleetOperationalLifecycleState): ReadyFleetOperationalProjection {
  const result = selectFleetOperationalProjection({ source: 'LIFECYCLE_VERIFIED', lifecycleState })
  if (result.status !== 'READY') throw new Error(result.message)
  return result
}

describe('Fleet operational projection adapter', () => {
  it('resolves BR1/01 active at S5_01 with its effective shared Truck Pool and Exca', () => {
    const projection = lifecycleProjection(state())
    expect(activeFleetsForPile(projection, pile('S5_01'))).toMatchObject([{ fleetId: 'F1', frontId: 'BR1/01', sharedTruckIds: ['T1'], excaCode: 'EX-1' }])
  })

  it('supports multiple active destinations sharing one Truck Pool and Exca', () => {
    const next = must(addFleetDestination(state(), addCommand(), context)).state
    const projection = lifecycleProjection(next)
    expect(activeDestinationsForAssignment(projection, assignment('A1'))).toEqual([pile('S5_01'), pile('S5_02')])
    expect(effectiveExcaForAssignment(projection, assignment('A1'))).toBe('EX-1')
    expect(eligibleTruckIdsForPile(projection, pile('S5_02'))).toEqual([truck('T1')])
  })

  it('resolves a redirect as one active destination rather than legacy successor inference', () => {
    const next = must(redirectFleetDestination(state(), redirectCommand(), context)).state
    const projection = lifecycleProjection(next)
    expect(activeFleetsForPile(projection, pile('S5_01'))).toEqual([])
    expect(activeFleetsForPile(projection, pile('S5_03'))).toMatchObject([{ assignmentId: 'A1' }])
  })

  it('moves active state from BR1/01 to BR1/02 and retains the former assignment as historical', () => {
    const next = must(transferFleetAssignment(state(), transferCommand(), context)).state
    const projection = lifecycleProjection(next)
    expect(projection.activeFleets.map((item) => item.fleetId)).toEqual([fleet('F2')])
    expect(historicalAssignments(projection)).toMatchObject([{ assignmentId: 'A1', fleetId: 'F1' }])
  })

  it('resolves reactivation of BR1/01 after BR1/02', () => {
    const transferred = must(transferFleetAssignment(state(), transferCommand(), context)).state
    const reactivated = must(reactivateFleetAssignment(transferred, reactivateCommand(), context)).state
    expect(lifecycleProjection(reactivated).activeFleets).toMatchObject([{ fleetId: 'F1', assignmentId: 'A3' }])
  })

  it('resolves BR1/01 -> BR1/02 -> BR1/03 -> BR1/01 without affecting the prior histories', () => {
    const second = must(transferFleetAssignment(state(), transferCommand(), context)).state
    const third = must(transferFleetAssignment(second, transferCommand({ commandId: command('TRANSFER-3'), replacementAssignmentId: assignment('A2'), newAssignmentId: assignment('A3'), activationEventId: event('E-A3'), closureEventId: event('E-C2'), configurationRevisionId: revision('R3'), destinationAssignments: [{ destinationAssignmentId: destination('D3'), pileId: pile('S5_03') }], targetFleetId: fleet('F3') }), context)).state
    const reactivated = must(reactivateFleetAssignment(third, reactivateCommand({ replacementAssignmentId: assignment('A3'), newAssignmentId: assignment('A4'), activationEventId: event('E-A4'), closureEventId: event('E-C3'), configurationRevisionId: revision('R4'), destinationAssignments: [{ destinationAssignmentId: destination('D4'), pileId: pile('S5_04') }] }), context)).state
    const projection = lifecycleProjection(reactivated)
    expect(projection.activeFleets).toMatchObject([{ fleetId: 'F1', assignmentId: 'A4' }])
    expect(projection.historicalAssignments).toHaveLength(3)
  })

  it('keeps independent active chains and deduplicates a shared Truck for Pile selection', () => {
    const projection = lifecycleProjection(state({ independent: true }))
    expect(projection.activeFleets).toHaveLength(2)
    expect(eligibleTruckIdsForPile(projection, pile('S5_01'))).toEqual([truck('T1')])
    expect(activeFleetsForPileTruck(projection, pile('S5_01'), truck('T1')).map((item) => item.fleetId).sort()).toEqual([fleet('F1'), fleet('F9')])
  })

  it('does not turn a cross-company destination conflict into an active lifecycle projection', () => {
    const conflicting = addFleetDestination(state({ crossCompany: true }), addCommand(), context)
    expect(conflicting).toMatchObject({ ok: false, error: { code: 'PILE_ASSIGNED_TO_DIFFERENT_COMPANY' } })
  })

  it('uses the existing legacy BASE/DERIVED projection when lifecycle is not migrated', () => {
    const masterData = buildFixtureMasterData()
    const base = buildFixtureFleetSetup(masterData)
    const derived = must(appendFrontContinuation({ fleetSetup: base, masterData, referenceFrontId: 'F1', frontNumber: 2, fleetId: 'FLEET-B', addedTruckIds: [], removedTruckIds: [] }))
    const projection = selectFleetOperationalProjection({ source: 'LEGACY_FALLBACK', shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: derived.fleetSetup })
    expect(projection).toMatchObject({ status: 'READY', source: 'LEGACY_FALLBACK', activeFleets: [{ fleetId: 'FLEET-B' }], historicalAssignments: [{ fleetId: 'FLEET-A' }] })
  })

  it('accepts equivalent verified lifecycle and legacy BASE/DERIVED projections before cutover', () => {
    const masterData = buildFixtureMasterData()
    const base = buildFixtureFleetSetup(masterData)
    const derived = must(appendFrontContinuation({ fleetSetup: base, masterData, referenceFrontId: 'F1', frontNumber: 2, fleetId: 'FLEET-B', addedTruckIds: [], removedTruckIds: [] }))
    const lifecycleState = must(deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: derived.fleetSetup }))
    expect(selectFleetOperationalProjection({ source: 'LIFECYCLE_VERIFIED', lifecycleState, legacyFleetSetup: derived.fleetSetup })).toMatchObject({ status: 'READY', source: 'LIFECYCLE_VERIFIED', activeFleets: [{ fleetId: 'FLEET-B' }] })
  })

  it('returns an explicit unavailable state for incomplete lifecycle data while exposing only explicit legacy fallback', () => {
    const fallback = buildFixtureFleetSetup(buildFixtureMasterData())
    const projection = selectFleetOperationalProjection({ source: 'LIFECYCLE_UNAVAILABLE', reason: 'MIGRATION_INCOMPLETE', message: 'Lifecycle rows exist without marker', shiftWorkspaceId: fixtureShiftId('LEGACY-1'), legacyFleetSetup: fallback })
    expect(projection).toMatchObject({ status: 'UNAVAILABLE', reason: 'MIGRATION_INCOMPLETE', safeLegacyFallback: { status: 'READY', source: 'LEGACY_FALLBACK' } })
  })

  it('reports a verified lifecycle/legacy difference instead of replacing legacy projection', () => {
    const legacy = buildFixtureFleetSetup(buildFixtureMasterData())
    const changed = must(addFleetDestination(state(), addCommand(), context)).state
    const projection = selectFleetOperationalProjection({ source: 'LIFECYCLE_VERIFIED', lifecycleState: changed, legacyFleetSetup: legacy })
    expect(projection).toMatchObject({ status: 'UNAVAILABLE', reason: 'PROJECTION_EQUIVALENCE_MISMATCH' })
  })

  it('maps Phase 1 incomplete and incompatibility errors to explicit lifecycle read states', () => {
    expect(lifecycleProjectionUnavailableReason({ code: 'FLEET_LIFECYCLE_MIGRATION_PARTIAL_STATE', message: 'partial' })).toBe('MIGRATION_INCOMPLETE')
    expect(lifecycleProjectionUnavailableReason({ code: 'FLEET_LIFECYCLE_MIGRATION_INCOMPATIBLE', message: 'incompatible' })).toBe('MIGRATION_INCOMPATIBLE')
  })
})
