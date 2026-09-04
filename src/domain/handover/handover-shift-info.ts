import type { SamplingHouseCode, SectorCode, ShiftCode } from '../common/codes'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '../common/codes'
import type { ShiftId } from '../common/identifiers'
import { parseShiftId } from '../common/identifiers'
import type { DomainError, Result } from '../common/result'
import { ok } from '../common/result'
import type { ShiftDate } from '../common/shift-date'
import { parseShiftDate } from '../common/shift-date'

/** Untrusted `Shift_Info` sheet row (ARCHITECTURE.md §9.1). */
export interface RawHandoverShiftInfo {
  readonly Shift_ID?: unknown
  readonly Date?: unknown
  readonly Shift?: unknown
  readonly Sector?: unknown
  readonly Location?: unknown
}

/** Validated previous-shift identity read from the archive's Shift_Info sheet. */
export interface HandoverShiftInfo {
  readonly shiftId: ShiftId
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: SectorCode
  readonly samplingHouseCode: SamplingHouseCode | undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Validates the Shift_Info sheet's single previous-shift row (Import
 * Validation — ARCHITECTURE.md §12: "Shift ID valid", "Date valid").
 * Runs every field parser and returns the first failure, never a
 * partially-accepted shift identity (rule 7: "Reject incomplete
 * carry-over rather than guessing"). `Location` is read but optional —
 * no confirmed rule makes it mandatory for carry-over validation.
 */
export function parseHandoverShiftInfo(raw: RawHandoverShiftInfo): Result<HandoverShiftInfo, DomainError> {
  const shiftIdResult = parseShiftId(asString(raw.Shift_ID))
  if (!shiftIdResult.ok) {
    return shiftIdResult
  }

  const dateResult = parseShiftDate(asString(raw.Date))
  if (!dateResult.ok) {
    return dateResult
  }

  const shiftCodeResult = parseShiftCode(asString(raw.Shift))
  if (!shiftCodeResult.ok) {
    return shiftCodeResult
  }

  const sectorCodeResult = parseSectorCode(asString(raw.Sector))
  if (!sectorCodeResult.ok) {
    return sectorCodeResult
  }

  let samplingHouseCode: SamplingHouseCode | undefined
  const rawLocation = raw.Location
  if (typeof rawLocation === 'string' && rawLocation.trim().length > 0) {
    const samplingHouseResult = parseSamplingHouseCode(rawLocation)
    if (!samplingHouseResult.ok) {
      return samplingHouseResult
    }
    samplingHouseCode = samplingHouseResult.value
  }

  return ok({
    shiftId: shiftIdResult.value,
    date: dateResult.value,
    shiftCode: shiftCodeResult.value,
    sectorCode: sectorCodeResult.value,
    samplingHouseCode,
  })
}
