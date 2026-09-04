import type { ShiftReport } from '@/application/reporting/report-types'
import type { SamplingHouseCode, SectorCode, ShiftCode } from '@/domain/common/codes'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { ShiftDate } from '@/domain/common/shift-date'
import type { Shift } from '@/domain/shift/shift'

/**
 * Machine-readable per-shift production summary published to the Google
 * Sheets `Shift_Summary` sheet (Phase 16 §8/§14). Every total is copied
 * verbatim from an already-built `ShiftReport.productionTotals` — this
 * module never scans raw HaulageTransactions or recomputes a total.
 * Field order here is independent of the sheet's column order; the
 * Google writer owns that mapping.
 */
export interface ShiftSummary {
  readonly shiftId: ShiftId
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
  readonly sectorCode: SectorCode
  readonly samplingHouseCode: SamplingHouseCode
  readonly ritTotal: number
  readonly batchTotal: number
  readonly incrementTotal: number
  readonly wrongTruckTotal: number
}

/**
 * Builds the Shift_Summary DTO from a Shift and its already-built
 * ShiftReport. Rejects a report that does not belong to the given Shift
 * (Date/ShiftCode mismatch) rather than guessing which is authoritative.
 * Deliberately reads only `report.header`/`report.productionTotals` —
 * both are language-invariant, so an 'id' and an 'en' ShiftReport for the
 * same shift always produce an identical ShiftSummary.
 */
export function buildShiftSummary(shift: Shift, report: ShiftReport): Result<ShiftSummary, DomainError> {
  if (report.header.date !== shift.date) {
    return err({
      code: 'SHIFT_SUMMARY_DATE_MISMATCH',
      message: `ShiftReport date ${report.header.date} does not match Shift date ${shift.date}`,
    })
  }
  if (report.header.shiftCode !== shift.shiftCode) {
    return err({
      code: 'SHIFT_SUMMARY_SHIFT_CODE_MISMATCH',
      message: `ShiftReport ShiftCode ${report.header.shiftCode} does not match Shift ShiftCode ${shift.shiftCode}`,
    })
  }

  return ok({
    shiftId: shift.id,
    date: shift.date,
    shiftCode: shift.shiftCode,
    sectorCode: shift.sectorCode,
    samplingHouseCode: shift.samplingHouseCode,
    ritTotal: report.productionTotals.rit,
    batchTotal: report.productionTotals.batch,
    incrementTotal: report.productionTotals.increment,
    wrongTruckTotal: report.productionTotals.wrongTruck,
  })
}
