import { describe, expect, it } from 'vitest'
import type { Brand } from '../common/brand'
import type { EmployeeId, FleetId, FrontId, PileId, ShiftId, TruckId } from '../common/identifiers'
import type { Result } from '../common/result'
import type { ExcaCode } from './exca-code'
import type { HaulerCode } from '../master/master-codes'
import {
  addFleetDestination,
  createFleetRejectedCommandProposal,
  createFleetOperationalLifecycleState,
  deactivateFleetAssignment,
  deriveLegacyFleetOperationalLifecycle,
  projectFleetOperationalLifecycle,
  reactivateFleetAssignment,
  redirectFleetDestination,
  removeFleetDestination,
  resolveFleetOperationalContext,
  transferFleetAssignment,
  updateFleetExca,
  updateFleetTruckPool,
  validateLegacyProjectionEquivalence,
  type AddFleetDestinationCommand,
  type FleetAssignmentId,
  type FleetCommandId,
  type FleetConfigurationRevision,
  type FleetConfigurationRevisionId,
  type FleetDestinationAssignment,
  type FleetDestinationAssignmentId,
  type FleetIdentity,
  type FleetOperationalAssignment,
  type FleetLifecycleValidationContext,
  type FleetOperationalEventId,
  type FleetOperationalLifecycleState,
  type ReactivateFleetAssignmentCommand,
  type RemoveFleetDestinationCommand,
  type TransferFleetAssignmentCommand,
} from './operational-lifecycle'
import { buildFixtureFleetSetup, buildFixtureHaulageTransaction, buildFixtureMasterData, buildFixtureSapPile, fixtureShiftId } from '@/test/fixtures/haulage-operation-test-fixtures'

function branded<T extends string>(value: string): Brand<string, T> { return value as Brand<string, T> }
function shift(value: string): ShiftId { return branded<'ShiftId'>(value) }
function fleet(value: string): FleetId { return branded<'FleetId'>(value) }
function front(value: string): FrontId { return branded<'FrontId'>(value) }
function pile(value: string): PileId { return branded<'PileId'>(value) }
function truck(value: string): TruckId { return branded<'TruckId'>(value) }
function employee(value: string): EmployeeId { return branded<'EmployeeId'>(value) }
function hauler(value: string): HaulerCode { return branded<'HaulerCode'>(value) }
function exca(value: string): ExcaCode { return branded<'ExcaCode'>(value) }
function assignment(value: string): FleetAssignmentId { return branded<'FleetAssignmentId'>(value) }
function revision(value: string): FleetConfigurationRevisionId { return branded<'FleetConfigurationRevisionId'>(value) }
function destination(value: string): FleetDestinationAssignmentId { return branded<'FleetDestinationAssignmentId'>(value) }
function event(value: string): FleetOperationalEventId { return branded<'FleetOperationalEventId'>(value) }
function command(value: string): FleetCommandId { return branded<'FleetCommandId'>(value) }

function must<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error('fixture failed')
  return result.value
}

const at = (value: string) => new Date(value)
const workspace = shift('SHIFT-1')
const operator = employee('E-1')
const baseTime = at('2026-09-04T20:00:00+08:00')
const context: FleetLifecycleValidationContext = {
  shiftWindow: { shiftWorkspaceId: workspace, startsAt: at('2026-09-04T19:00:00+08:00'), endsAt: at('2026-09-05T07:00:00+08:00') },
  isTruckEligibleForCompany: (truckId, company) => (company === hauler('H1') ? truckId !== truck('T-H2') : truckId === truck('T-H2')),
  isExcaEligibleForCompany: (excaCode, company) => company === hauler('H1') ? excaCode !== exca('EX-H2') : excaCode === exca('EX-H2'),
}

function baseState(options: { readonly extraDestinations?: readonly string[]; readonly unrelated?: boolean } = {}): FleetOperationalLifecycleState {
  const identities: FleetIdentity[] = [
    { shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
    { shiftWorkspaceId: workspace, fleetId: fleet('F2'), frontId: front('BR1/02'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
    { shiftWorkspaceId: workspace, fleetId: fleet('F3'), frontId: front('BR1/03'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' as const },
  ]
  const assignments: FleetOperationalAssignment[] = [{ assignmentId: assignment('A1'), shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), lineageRootFleetId: fleet('F1'), activatedAt: baseTime, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 }]
  const configurationRevisions: FleetConfigurationRevision[] = [{ revisionId: revision('R1'), assignmentId: assignment('A1'), revisionNumber: 1, effectiveAt: baseTime, excaCode: exca('EX-1'), truckIds: [truck('T1')], createdBy: operator, reason: 'ACTIVATED' }]
  const destinationAssignments: FleetDestinationAssignment[] = [{ destinationAssignmentId: destination('D1'), assignmentId: assignment('A1'), pileId: pile('S5_01'), openedAt: baseTime, openedBy: operator }]
  for (const [index, pileId] of (options.extraDestinations ?? []).entries()) destinationAssignments.push({ destinationAssignmentId: destination(`D-${index + 2}`), assignmentId: assignment('A1'), pileId: pile(pileId), openedAt: baseTime, openedBy: operator })
  if (options.unrelated) {
    identities.push({ shiftWorkspaceId: workspace, fleetId: fleet('F9'), frontId: front('BR1/09'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F9'), provenance: 'OPERATOR' })
    assignments.push({ assignmentId: assignment('A9'), shiftWorkspaceId: workspace, fleetId: fleet('F9'), frontId: front('BR1/09'), lineageRootFleetId: fleet('F9'), activatedAt: baseTime, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 })
    configurationRevisions.push({ revisionId: revision('R9'), assignmentId: assignment('A9'), revisionNumber: 1, effectiveAt: baseTime, excaCode: exca('EX-1'), truckIds: [truck('T1')], createdBy: operator, reason: 'ACTIVATED' })
    destinationAssignments.push({ destinationAssignmentId: destination('D9'), assignmentId: assignment('A9'), pileId: pile('S5_09'), openedAt: baseTime, openedBy: operator })
  }
  return must(createFleetOperationalLifecycleState({ identities, assignments, configurationRevisions, destinationAssignments, events: [], commandReceipts: [] }))
}

function addCommand(overrides: Partial<AddFleetDestinationCommand> = {}): AddFleetDestinationCommand {
  return { commandId: command('CMD-ADD'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:05:00+08:00'), recordedAt: at('2026-09-04T20:06:00+08:00'), actorId: operator, assignmentId: assignment('A1'), destinationAssignmentId: destination('D2'), eventId: event('EV-ADD'), pileId: pile('S5_02'), ...overrides }
}

function transferCommand(overrides: Partial<TransferFleetAssignmentCommand> = {}): TransferFleetAssignmentCommand {
  return {
    commandId: command('CMD-TRANSFER'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:05:00+08:00'), recordedAt: at('2026-09-04T20:06:00+08:00'), actorId: operator,
    replacementAssignmentId: assignment('A1'), newAssignmentId: assignment('A2'), activationEventId: event('EV-ACT-2'), closureEventId: event('EV-CLOSE-1'), configurationRevisionId: revision('R2'), destinationAssignments: [{ destinationAssignmentId: destination('D2'), pileId: pile('S5_02') }], excaCode: exca('EX-1'), truckIds: [truck('T1')], targetFleetId: fleet('F2'), ...overrides,
  }
}

function reactivateCommand(overrides: Partial<ReactivateFleetAssignmentCommand> = {}): ReactivateFleetAssignmentCommand {
  return {
    commandId: command('CMD-REACTIVATE'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator,
    replacementAssignmentId: assignment('A2'), newAssignmentId: assignment('A3'), activationEventId: event('EV-ACT-3'), closureEventId: event('EV-CLOSE-2'), configurationRevisionId: revision('R3'), destinationAssignments: [{ destinationAssignmentId: destination('D3'), pileId: pile('S5_03') }], excaCode: exca('EX-1'), truckIds: [truck('T1')], reactivatedFleetId: fleet('F1'), ...overrides,
  }
}

describe('Fleet Operational Lifecycle — Phase 0 domain foundation', () => {
  it('allows the same Fleet Number in different Shift Workspaces', () => {
    const otherWorkspace = shift('SHIFT-2')
    const state = must(createFleetOperationalLifecycleState({
      identities: [
        { shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' },
        { shiftWorkspaceId: otherWorkspace, fleetId: fleet('F1'), frontId: front('BR1/01'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'OPERATOR' },
      ],
      assignments: [
        { assignmentId: assignment('A1'), shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), lineageRootFleetId: fleet('F1'), activatedAt: baseTime, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 },
        { assignmentId: assignment('A2'), shiftWorkspaceId: otherWorkspace, fleetId: fleet('F1'), frontId: front('BR1/01'), lineageRootFleetId: fleet('F1'), activatedAt: baseTime, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 },
      ], configurationRevisions: [], destinationAssignments: [], events: [], commandReceipts: [],
    }))
    expect(projectFleetOperationalLifecycle(state).activeAssignmentIds).toHaveLength(2)
  })

  it('rejects duplicate Fleet identity inside one Shift Workspace', () => {
    const state = baseState()
    const result = createFleetOperationalLifecycleState({ ...state, identities: [...state.identities, state.identities[0]] })
    expect(result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_FLEET_IDENTITY' } })
  })

  it('redirects one active destination atomically', () => {
    const result = must(redirectFleetDestination(baseState(), { ...addCommand(), commandId: command('CMD-REDIRECT'), eventId: event('EV-REDIRECT'), closedDestinationAssignmentId: destination('D1'), openedDestinationAssignmentId: destination('D2'), destinationPileId: pile('S5_02') }, context))
    const active = result.projection.assignments[0].activeDestinations.map((item) => item.pileId)
    expect(active).toEqual([pile('S5_02')])
  })

  it('adds a concurrent multi-destination Pile without duplicating Fleet identity', () => {
    const result = must(addFleetDestination(baseState(), addCommand(), context))
    expect(result.projection.assignments[0].activeDestinations.map((item) => item.pileId)).toEqual([pile('S5_01'), pile('S5_02')])
    expect(result.state.identities).toHaveLength(3)
  })

  it('removes only the selected destination when another remains', () => {
    const added = must(addFleetDestination(baseState(), addCommand(), context))
    const commandPayload: RemoveFleetDestinationCommand = { commandId: command('CMD-REMOVE'), expectedAssignmentVersion: 2, occurredAt: at('2026-09-04T20:07:00+08:00'), recordedAt: at('2026-09-04T20:08:00+08:00'), actorId: operator, assignmentId: assignment('A1'), destinationAssignmentId: destination('D2'), eventId: event('EV-REMOVE') }
    const removed = must(removeFleetDestination(added.state, commandPayload, context))
    expect(removed.projection.assignments[0].activeDestinations.map((item) => item.pileId)).toEqual([pile('S5_01')])
  })

  it('rejects removal of the final active destination', () => {
    const commandPayload: RemoveFleetDestinationCommand = { commandId: command('CMD-REMOVE'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:07:00+08:00'), recordedAt: at('2026-09-04T20:08:00+08:00'), actorId: operator, assignmentId: assignment('A1'), destinationAssignmentId: destination('D1'), eventId: event('EV-REMOVE') }
    expect(removeFleetDestination(baseState(), commandPayload, context)).toMatchObject({ ok: false, error: { code: 'LAST_DESTINATION_REMOVAL_REQUIRES_DEACTIVATION' } })
  })

  it('explicitly deactivates a Fleet assignment', () => {
    const result = must(deactivateFleetAssignment(baseState(), { commandId: command('CMD-DEACTIVATE'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:08:00+08:00'), recordedAt: at('2026-09-04T20:08:01+08:00'), actorId: operator, assignmentId: assignment('A1'), eventId: event('EV-DEACTIVATE') }, context))
    expect(result.projection.activeAssignmentIds).toEqual([])
  })

  it('transfers BR1/01 to BR1/02 without changing static identities', () => {
    const result = must(transferFleetAssignment(baseState(), transferCommand(), context))
    expect(result.projection.assignments.filter((item) => item.active).map((item) => item.assignment.frontId)).toEqual([front('BR1/02')])
    expect(result.state.identities.map((item) => item.fleetId)).toContain(fleet('F1'))
  })

  it('reactivates original BR1/01 after BR1/02', () => {
    const transferred = must(transferFleetAssignment(baseState(), transferCommand(), context))
    const reactivated = must(reactivateFleetAssignment(transferred.state, reactivateCommand(), context))
    expect(reactivated.projection.assignments.filter((item) => item.active).map((item) => item.assignment.frontId)).toEqual([front('BR1/01')])
    expect(reactivated.state.assignments.filter((item) => item.fleetId === fleet('F1'))).toHaveLength(2)
  })

  it('reactivates BR1/01 after a longer BR1/01 → BR1/02 → BR1/03 chain', () => {
    const second = must(transferFleetAssignment(baseState(), transferCommand(), context))
    const third = must(transferFleetAssignment(second.state, transferCommand({ commandId: command('CMD-TRANSFER-3'), replacementAssignmentId: assignment('A2'), newAssignmentId: assignment('A3'), activationEventId: event('EV-ACT-3'), closureEventId: event('EV-CLOSE-2'), configurationRevisionId: revision('R3'), destinationAssignments: [{ destinationAssignmentId: destination('D3'), pileId: pile('S5_03') }], targetFleetId: fleet('F3') }), context))
    const result = must(reactivateFleetAssignment(third.state, reactivateCommand({ commandId: command('CMD-REACTIVATE-1'), replacementAssignmentId: assignment('A3'), newAssignmentId: assignment('A4'), activationEventId: event('EV-ACT-4'), closureEventId: event('EV-CLOSE-3'), configurationRevisionId: revision('R4'), destinationAssignments: [{ destinationAssignmentId: destination('D4'), pileId: pile('S5_04') }], reactivatedFleetId: fleet('F1') }), context))
    expect(result.projection.assignments.filter((item) => item.active).map((item) => item.assignment.frontId)).toEqual([front('BR1/01')])
  })

  it('preserves an unrelated active Fleet during reactivation', () => {
    const transferred = must(transferFleetAssignment(baseState({ unrelated: true }), transferCommand(), context))
    const result = must(reactivateFleetAssignment(transferred.state, reactivateCommand(), context))
    expect(result.projection.assignments.filter((item) => item.active).map((item) => item.assignment.assignmentId).sort()).toEqual([assignment('A3'), assignment('A9')].sort())
  })

  it('redirects a destination after reactivation without changing BR1/01 identity', () => {
    const transferred = must(transferFleetAssignment(baseState(), transferCommand(), context))
    const reactivated = must(reactivateFleetAssignment(transferred.state, reactivateCommand(), context))
    const result = must(redirectFleetDestination(reactivated.state, { commandId: command('CMD-REDIRECT-REACT'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:12:00+08:00'), recordedAt: at('2026-09-04T20:13:00+08:00'), actorId: operator, assignmentId: assignment('A3'), closedDestinationAssignmentId: destination('D3'), openedDestinationAssignmentId: destination('D4'), eventId: event('EV-REDIRECT-REACT'), destinationPileId: pile('S5_04') }, context))
    expect(result.projection.assignments.find((item) => item.assignment.assignmentId === assignment('A3'))?.activeDestinations.map((item) => item.pileId)).toEqual([pile('S5_04')])
  })

  it('adds a concurrent destination after reactivation', () => {
    const transferred = must(transferFleetAssignment(baseState(), transferCommand(), context))
    const reactivated = must(reactivateFleetAssignment(transferred.state, reactivateCommand(), context))
    const result = must(addFleetDestination(reactivated.state, { commandId: command('CMD-ADD-REACT'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:12:00+08:00'), recordedAt: at('2026-09-04T20:13:00+08:00'), actorId: operator, assignmentId: assignment('A3'), destinationAssignmentId: destination('D4'), eventId: event('EV-ADD-REACT'), pileId: pile('S5_04') }, context))
    expect(result.projection.assignments.find((item) => item.assignment.assignmentId === assignment('A3'))?.activeDestinations).toHaveLength(2)
  })

  it('rejects reactivation when the target Fleet is already active', () => {
    expect(reactivateFleetAssignment(baseState(), reactivateCommand({ replacementAssignmentId: assignment('A1'), reactivatedFleetId: fleet('F1') }), context)).toMatchObject({ ok: false, error: { code: 'FLEET_ALREADY_ACTIVE' } })
  })

  it('shares one Truck Pool over all active destinations', () => {
    const result = must(addFleetDestination(baseState(), addCommand(), context))
    expect(result.projection.assignments[0].effectiveConfiguration?.truckIds).toEqual([truck('T1')])
  })

  it('allows same-company Truck membership across active Fleets', () => {
    const state = baseState({ unrelated: true })
    const result = updateFleetTruckPool(state, { commandId: command('CMD-TRUCKS'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator, assignmentId: assignment('A1'), revisionId: revision('R2'), eventId: event('EV-TRUCKS'), truckIds: [truck('T1')] }, context)
    expect(result).toMatchObject({ ok: true })
  })

  it('allows same-company multi-Fleet destination sharing', () => {
    const result = addFleetDestination(baseState({ unrelated: true }), addCommand({ pileId: pile('S5_09') }), context)
    expect(result).toMatchObject({ ok: true })
  })

  it('rejects cross-company Truck membership', () => {
    const result = updateFleetTruckPool(baseState(), { commandId: command('CMD-TRUCKS'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator, assignmentId: assignment('A1'), revisionId: revision('R2'), eventId: event('EV-TRUCKS'), truckIds: [truck('T-H2')] }, context)
    expect(result).toMatchObject({ ok: false, error: { code: 'TRUCK_NOT_ELIGIBLE_FOR_COMPANY' } })
  })

  it('rejects a Pile already active for another Company', () => {
    const state = baseState()
    const foreign = must(createFleetOperationalLifecycleState({ ...state, identities: [...state.identities, { shiftWorkspaceId: workspace, fleetId: fleet('F-H2'), frontId: front('BR1/08'), haulerCode: hauler('H2'), lineageRootFleetId: fleet('F-H2'), provenance: 'OPERATOR' }], assignments: [...state.assignments, { assignmentId: assignment('A-H2'), shiftWorkspaceId: workspace, fleetId: fleet('F-H2'), frontId: front('BR1/08'), lineageRootFleetId: fleet('F-H2'), activatedAt: baseTime, activatedBy: operator, provenance: 'OPERATOR', initialVersion: 1 }], configurationRevisions: [...state.configurationRevisions, { revisionId: revision('R-H2'), assignmentId: assignment('A-H2'), revisionNumber: 1, effectiveAt: baseTime, truckIds: [truck('T-H2')], createdBy: operator, reason: 'ACTIVATED' }], destinationAssignments: [...state.destinationAssignments, { destinationAssignmentId: destination('D-H2'), assignmentId: assignment('A-H2'), pileId: pile('S5_02'), openedAt: baseTime, openedBy: operator }] }))
    expect(addFleetDestination(foreign, addCommand(), context)).toMatchObject({ ok: false, error: { code: 'PILE_ASSIGNED_TO_DIFFERENT_COMPANY' } })
  })

  it('creates a new Exca configuration revision that applies to all destinations', () => {
    const multi = must(addFleetDestination(baseState(), addCommand(), context))
    const result = must(updateFleetExca(multi.state, { commandId: command('CMD-EXCA'), expectedAssignmentVersion: 2, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator, assignmentId: assignment('A1'), revisionId: revision('R2'), eventId: event('EV-EXCA'), excaCode: exca('EX-2') }, context))
    expect(result.projection.assignments[0].effectiveConfiguration).toMatchObject({ revisionNumber: 2, excaCode: exca('EX-2') })
    expect(result.projection.assignments[0].activeDestinations).toHaveLength(2)
  })

  it('creates a new Truck Pool configuration revision', () => {
    const result = must(updateFleetTruckPool(baseState(), { commandId: command('CMD-TRUCKS'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator, assignmentId: assignment('A1'), revisionId: revision('R2'), eventId: event('EV-TRUCKS'), truckIds: [truck('T1'), truck('T2')] }, context))
    expect(result.projection.assignments[0].effectiveConfiguration?.truckIds).toEqual([truck('T1'), truck('T2')])
  })

  it('returns a structured stale-version conflict', () => {
    const payload = addCommand({ expectedAssignmentVersion: 0 })
    const result = addFleetDestination(baseState(), payload, context)
    expect(result).toMatchObject({ ok: false, error: { code: 'ASSIGNMENT_VERSION_STALE' } })
    if (!result.ok) expect(createFleetRejectedCommandProposal('ADD_DESTINATION', payload, result.error, baseState())).toMatchObject({ status: 'REJECTED', currentAssignmentVersion: 1, reasonCode: 'ASSIGNMENT_VERSION_STALE' })
  })

  it('replays a command idempotently without adding a second event', () => {
    const first = must(addFleetDestination(baseState(), addCommand(), context))
    const replay = must(addFleetDestination(first.state, addCommand(), context))
    expect(replay.state.events).toHaveLength(1)
    expect(replay.receipt.commandId).toBe(command('CMD-ADD'))
    expect(replay.receipt.replayed).toBe(true)
  })

  it('accepts delayed occurredAt inside the overnight Shift window', () => {
    const result = addFleetDestination(baseState(), addCommand({ occurredAt: at('2026-09-05T06:30:00+08:00'), recordedAt: at('2026-09-05T06:50:00+08:00') }), context)
    expect(result).toMatchObject({ ok: true })
  })

  it('rejects delayed occurredAt outside the Shift window', () => {
    expect(addFleetDestination(baseState(), addCommand({ occurredAt: at('2026-09-05T07:01:00+08:00'), recordedAt: at('2026-09-05T07:02:00+08:00') }), context)).toMatchObject({ ok: false, error: { code: 'OCCURRED_AT_OUTSIDE_SHIFT_WINDOW' } })
  })

  it('requires a reason for manually adjusted occurredAt', () => {
    expect(addFleetDestination(baseState(), addCommand({ occurredAtAdjusted: true }), context)).toMatchObject({ ok: false, error: { code: 'OCCURRED_AT_REASON_REQUIRED' } })
  })

  it('rejects a command when the operational Shift window is unresolved', () => {
    expect(addFleetDestination(baseState(), addCommand(), {})).toMatchObject({ ok: false, error: { code: 'SHIFT_OPERATIONAL_WINDOW_UNRESOLVED' } })
  })

  it('classifies legacy active Fleet deterministically', () => {
    const masterData = buildFixtureMasterData()
    const setup = buildFixtureFleetSetup(masterData)
    const lifecycle = must(deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: setup }))
    expect(projectFleetOperationalLifecycle(lifecycle).activeAssignmentIds).toHaveLength(1)
  })

  it('retains legacy historical classification instead of treating null timestamps as active', () => {
    const historical = must(createFleetOperationalLifecycleState({
      identities: [{ shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), haulerCode: hauler('H1'), lineageRootFleetId: fleet('F1'), provenance: 'LEGACY_HISTORICAL' }],
      assignments: [{ assignmentId: assignment('A1'), shiftWorkspaceId: workspace, fleetId: fleet('F1'), frontId: front('BR1/01'), lineageRootFleetId: fleet('F1'), activatedAt: null, activatedBy: null, provenance: 'LEGACY_HISTORICAL', initialVersion: 1 }], configurationRevisions: [], destinationAssignments: [], events: [], commandReceipts: [],
    }))
    expect(projectFleetOperationalLifecycle(historical).activeAssignmentIds).toEqual([])
  })

  it('proves legacy projection equivalence before migration', () => {
    const masterData = buildFixtureMasterData()
    const setup = buildFixtureFleetSetup(masterData)
    const input = { shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: setup }
    expect(validateLegacyProjectionEquivalence(input, must(deriveLegacyFleetOperationalLifecycle(input)))).toMatchObject({ ok: true })
  })

  it('uses deterministic legacy migration identifiers on replay', () => {
    const masterData = buildFixtureMasterData(); const input = { shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: buildFixtureFleetSetup(masterData) }
    expect(must(deriveLegacyFleetOperationalLifecycle(input)).assignments[0].assignmentId).toBe(must(deriveLegacyFleetOperationalLifecycle(input)).assignments[0].assignmentId)
  })

  it('leaves historical Wrong Truck snapshots unchanged after a Truck Pool revision', () => {
    const masterData = buildFixtureMasterData(); const setup = buildFixtureFleetSetup(masterData); const transaction = buildFixtureHaulageTransaction({ id: 'TX-WRONG', shiftId: 'SHIFT-1', pile: buildFixtureSapPile('S5_01'), batch: 1, rit: 1, masterData, fleetSetup: setup, truckId: 'T2' })
    const before = transaction.truckValidation
    const result = must(updateFleetTruckPool(baseState(), { commandId: command('CMD-TRUCKS'), expectedAssignmentVersion: 1, occurredAt: at('2026-09-04T20:10:00+08:00'), recordedAt: at('2026-09-04T20:11:00+08:00'), actorId: operator, assignmentId: assignment('A1'), revisionId: revision('R2'), eventId: event('EV-TRUCKS'), truckIds: [truck('T2')] }, context))
    expect(transaction.truckValidation).toEqual(before)
    expect(result.projection.assignments[0].effectiveConfiguration?.truckIds).toEqual([truck('T2')])
  })

  it('returns unresolved rather than guessing a legacy temporal context', () => {
    const masterData = buildFixtureMasterData(); const lifecycle = must(deriveLegacyFleetOperationalLifecycle({ shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetSetup: buildFixtureFleetSetup(masterData, pile('S5_01')) }))
    expect(resolveFleetOperationalContext(lifecycle, { shiftWorkspaceId: fixtureShiftId('LEGACY-1'), fleetId: fleet('FLEET-A'), pileId: pile('S5_01'), occurredAt: baseTime })).toMatchObject({ ok: false, error: { code: 'TEMPORAL_CONTEXT_UNRESOLVED' } })
  })

  it('returns ambiguous rather than guessing between overlapping assignment histories', () => {
    const state = baseState()
    const ambiguous: FleetOperationalLifecycleState = { ...state, assignments: [...state.assignments, { ...state.assignments[0], assignmentId: assignment('A-OVERLAP') }] }
    expect(resolveFleetOperationalContext(ambiguous, { shiftWorkspaceId: workspace, fleetId: fleet('F1'), pileId: pile('S5_01'), occurredAt: at('2026-09-04T20:01:00+08:00') })).toMatchObject({ ok: false, error: { code: 'TEMPORAL_CONTEXT_AMBIGUOUS' } })
  })

  it('resolves an unambiguous current operational context by occurrence time', () => {
    const result = must(resolveFleetOperationalContext(baseState(), { shiftWorkspaceId: workspace, fleetId: fleet('F1'), pileId: pile('S5_01'), occurredAt: at('2026-09-04T20:01:00+08:00') }))
    expect(result).toMatchObject({ assignmentId: assignment('A1'), configurationRevisionId: revision('R1'), destinationAssignmentId: destination('D1') })
  })

  it('does not mutate input state arrays or objects', () => {
    const state = baseState(); const before = JSON.stringify(state)
    must(addFleetDestination(state, addCommand(), context))
    expect(JSON.stringify(state)).toBe(before)
  })
})
