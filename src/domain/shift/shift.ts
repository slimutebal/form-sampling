import type { SamplingHouseCode, SectorCode, ShiftCode } from '../common/codes'
import type { ShiftId } from '../common/identifiers'
import type { ShiftDate } from '../common/shift-date'
import type { ShiftStatus } from './shift-status'

/**
 * Minimal Shift domain model: the fundamental known context only.
 * Persistence, sync, UI language, and finalization behavior are out
 * of scope for Phase 2.
 */
export interface Shift {
  readonly id: ShiftId
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: SectorCode
  readonly samplingHouseCode: SamplingHouseCode
  readonly status: ShiftStatus
}

export function createShift(params: {
  id: ShiftId
  date: ShiftDate
  shiftCode: ShiftCode
  sectorCode: SectorCode
  samplingHouseCode: SamplingHouseCode
  status: ShiftStatus
}): Shift {
  return { ...params }
}
