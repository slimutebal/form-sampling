import type { ShiftCode } from '@/domain/common/codes'
import type { FleetId, FrontId, ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { ShiftDate } from '@/domain/common/shift-date'
import type { HaulerCode } from '@/domain/master/master-codes'
import type { FleetDefinition } from './fleet-definition'
import type { FrontDefinition } from './front'
import type { Shift } from '@/domain/shift/shift'

/** Immutable business-identity snapshot for one Fleet Assignment. */
export interface FleetAssignmentIdentity {
  /** Aliases the existing stable FleetId; this deliberately is not a second UUID. */
  readonly fleetAssignmentId: FleetId
  readonly fleetSequence: number
  readonly fleetCode: string
  readonly originShiftId: ShiftId
  readonly operationalDate: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: string
  readonly frontId: FrontId
  readonly company: HaulerCode
}

export interface FleetAssignmentIdentityInput {
  readonly operationalDate: ShiftDate
  readonly shiftCode: string
  readonly sectorCode: string
  readonly sequence: number
}

export interface CreateFleetAssignmentIdentityParams {
  readonly fleetAssignmentId: FleetId
  readonly fleetSequence: number
  readonly originShiftId: ShiftId
  readonly operationalDate: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: string
  readonly frontId: FrontId
  readonly company: HaulerCode
}

function validSequence(sequence: number): boolean {
  return Number.isSafeInteger(sequence) && sequence > 0
}

function validOperationalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** `Fleet_01`; sequences above 99 are intentionally never truncated. */
export function formatFleetShortLabel(sequence: number): string {
  if (!validSequence(sequence)) throw new RangeError('Fleet sequence must be a positive integer')
  return `Fleet_${String(sequence).padStart(2, '0')}`
}

/** `YYMMDD + Shift + "-" + Sector + "-F" + Seq`, e.g. `261018D-BR1-F01`. */
export function formatFleetFullCode(input: FleetAssignmentIdentityInput): string {
  if (!validSequence(input.sequence)) throw new RangeError('Fleet sequence must be a positive integer')
  const [year, month, day] = input.operationalDate.split('-')
  return `${year.slice(-2)}${month}${day}${input.shiftCode}-${input.sectorCode}-F${String(input.sequence).padStart(2, '0')}`
}

/** Creates a complete identity from the originating workspace, never the system clock. */
export function createFleetAssignmentIdentity(
  params: CreateFleetAssignmentIdentityParams,
): Result<FleetAssignmentIdentity, DomainError> {
  if (!validSequence(params.fleetSequence)) return err({ code: 'INVALID_FLEET_SEQUENCE', message: 'Fleet sequence must be a positive integer' })
  if (!validOperationalDate(params.operationalDate)) return err({ code: 'INVALID_FLEET_OPERATIONAL_DATE', message: 'Fleet identity requires an ISO operational date' })
  if (!params.sectorCode.trim()) return err({ code: 'INVALID_FLEET_SECTOR', message: 'Fleet identity requires a Sector' })
  return ok({ ...params, fleetCode: formatFleetFullCode({ ...params, sequence: params.fleetSequence }) })
}

/** Verifies that a restored/persisted identity has not been silently altered. */
export function validateFleetAssignmentIdentity(identity: FleetAssignmentIdentity): Result<FleetAssignmentIdentity, DomainError> {
  const expected = createFleetAssignmentIdentity(identity)
  if (!expected.ok) return expected
  if (identity.fleetCode !== expected.value.fleetCode) {
    return err({ code: 'FLEET_IDENTITY_CODE_MISMATCH', message: `Fleet code ${identity.fleetCode} does not match its persisted shift identity` })
  }
  return ok(identity)
}

export type FleetAssignmentIdentityRead =
  | { readonly status: 'RESOLVED'; readonly source: 'PERSISTED' | 'LEGACY_DETERMINISTIC'; readonly identity: FleetAssignmentIdentity }
  | { readonly status: 'UNRESOLVED'; readonly fleetAssignmentId: FleetId; readonly reason: string }

/**
 * Reads a historical assignment without consulting the active workspace.
 * Old rows receive a code only when their Front number and origin Shift make
 * every code component deterministic; otherwise their original FleetId is
 * retained and explicitly reported as unresolved.
 */
export function resolveFleetAssignmentIdentity(
  fleet: FleetDefinition,
  front: FrontDefinition | undefined,
  shift: Shift,
): FleetAssignmentIdentityRead {
  const persisted = fleet.assignmentIdentity
  if (persisted) {
    const valid = validateFleetAssignmentIdentity(persisted)
    if (valid.ok && persisted.fleetAssignmentId === fleet.fleetId && persisted.frontId === fleet.frontId) {
      return { status: 'RESOLVED', source: 'PERSISTED', identity: persisted }
    }
    return { status: 'UNRESOLVED', fleetAssignmentId: fleet.fleetId, reason: 'Persisted Fleet identity is inconsistent with its Fleet assignment' }
  }
  if (!front || front.frontId !== fleet.frontId || front.sectorCode !== shift.sectorCode) {
    return { status: 'UNRESOLVED', fleetAssignmentId: fleet.fleetId, reason: 'Legacy Fleet lacks a Front/Shift combination that can determine its code' }
  }
  const match = new RegExp(`^${String(shift.sectorCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d{2})$`).exec(String(front.frontId))
  const sequence = match ? Number(match[1]) : Number.NaN
  if (!validSequence(sequence)) {
    return { status: 'UNRESOLVED', fleetAssignmentId: fleet.fleetId, reason: 'Legacy Fleet Front number is not canonical' }
  }
  const identity = createFleetAssignmentIdentity({
    fleetAssignmentId: fleet.fleetId,
    fleetSequence: sequence,
    originShiftId: shift.id,
    operationalDate: shift.date,
    shiftCode: shift.shiftCode,
    sectorCode: shift.sectorCode,
    frontId: front.frontId,
    company: front.haulerCode,
  })
  return identity.ok
    ? { status: 'RESOLVED', source: 'LEGACY_DETERMINISTIC', identity: identity.value }
    : { status: 'UNRESOLVED', fleetAssignmentId: fleet.fleetId, reason: identity.error.message }
}

export interface FleetSequenceValidation {
  readonly valid: boolean
  readonly duplicate: boolean
  readonly requiresSkipConfirmation: boolean
  readonly smallestUnused?: number
}

export function validateFleetSequence(sequence: number, usedSequences: readonly number[]): FleetSequenceValidation {
  const validUsed = new Set(usedSequences.filter(validSequence))
  let smallestUnused = 1
  while (validUsed.has(smallestUnused)) smallestUnused += 1
  const valid = validSequence(sequence)
  return { valid, duplicate: valid && validUsed.has(sequence), requiresSkipConfirmation: valid && !validUsed.has(sequence) && sequence > smallestUnused, smallestUnused }
}
