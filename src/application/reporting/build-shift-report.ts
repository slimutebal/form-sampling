import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import type { PileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import { findEmployee, type MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'
import { isoWeekOf } from './iso-week'
import { getReportLabels } from './report-localization'
import type {
  HaulageDetailRow,
  ManpowerAssignment,
  PendingSampleRow,
  ProductionSummaryRow,
  ProductionTotals,
  ReportLanguage,
  ReportManpowerRow,
  SampleHandlingRow,
  ShiftReport,
  WrongTruckRow,
} from './report-types'

export interface BuildShiftReportInput {
  readonly language: ReportLanguage
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly haulageTransactions: readonly HaulageTransaction[]
  readonly samplePositions: readonly SamplePosition[]
  readonly masterData: MasterData
  /** Explicit, caller-supplied manpower for this shift (ROADMAP Phase 14 §3). Defaults to none. */
  readonly manpowerAssignments: readonly ManpowerAssignment[]
}

function buildError(code: string, message: string): Result<never, DomainError> {
  return err({ code, message })
}

/**
 * Builds the immutable Phase 14 shift report from already-validated,
 * already-stored domain state (ROADMAP Phase 14). Never recomputes a
 * historical sampling decision, increment identity, or truck
 * validation — every such value is read from the stored
 * HaulageTransaction/SamplePosition snapshots (§0). Never mutates any
 * input array/object.
 *
 * Validated before anything is derived, mirroring
 * `buildShiftExportSnapshot`'s carry-over checks (§11):
 *  - no two Piles share a PileId (`REPORT_DUPLICATE_PILE_ID`);
 *  - every HaulageTransaction/SamplePosition's `shiftId` equals
 *    `shift.id` (`REPORT_HAULAGE_SHIFT_ID_MISMATCH` /
 *    `REPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH`);
 *  - every HaulageTransaction/SamplePosition's `pileId` resolves to a
 *    Pile in `piles` (`REPORT_HAULAGE_PILE_NOT_FOUND` /
 *    `REPORT_SAMPLE_POSITION_PILE_NOT_FOUND`), and a SamplePosition's
 *    `oreCode` matches that Pile's Ore
 *    (`REPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH`);
 *  - every ManpowerAssignment's `employeeId` resolves in `masterData`
 *    (`REPORT_MANPOWER_EMPLOYEE_NOT_FOUND`, §3).
 */
export function buildShiftReport(input: BuildShiftReportInput): Result<ShiftReport, DomainError> {
  const { language, shift, piles, haulageTransactions, samplePositions, masterData, manpowerAssignments } = input
  const labels = getReportLabels(language)

  const pileById = new Map<PileId, Pile>()
  for (const pile of piles) {
    if (pileById.has(pile.id)) {
      return buildError('REPORT_DUPLICATE_PILE_ID', `Duplicate PileId in report input: ${pile.id}`)
    }
    pileById.set(pile.id, pile)
  }

  for (const transaction of haulageTransactions) {
    if (transaction.shiftId !== shift.id) {
      return buildError(
        'REPORT_HAULAGE_SHIFT_ID_MISMATCH',
        `HaulageTransaction ${transaction.id} has ShiftId ${transaction.shiftId}, expected ${shift.id}`,
      )
    }
    if (!pileById.has(transaction.pileId)) {
      return buildError(
        'REPORT_HAULAGE_PILE_NOT_FOUND',
        `HaulageTransaction ${transaction.id} references PileId ${transaction.pileId}, which is not part of this report`,
      )
    }
  }

  for (const position of samplePositions) {
    if (position.shiftId !== shift.id) {
      return buildError(
        'REPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH',
        `SamplePosition ${position.id} has ShiftId ${position.shiftId}, expected ${shift.id}`,
      )
    }
    const pile = pileById.get(position.pileId)
    if (!pile) {
      return buildError(
        'REPORT_SAMPLE_POSITION_PILE_NOT_FOUND',
        `SamplePosition ${position.id} references PileId ${position.pileId}, which is not part of this report`,
      )
    }
    if (pile.oreCode !== position.oreCode) {
      return buildError(
        'REPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH',
        `SamplePosition ${position.id} Ore ${position.oreCode} does not match Pile ${pile.id} Ore ${pile.oreCode}`,
      )
    }
  }

  const manpower: ReportManpowerRow[] = []
  for (const assignment of manpowerAssignments) {
    const employee = findEmployee(masterData, assignment.employeeId)
    if (!employee) {
      return buildError(
        'REPORT_MANPOWER_EMPLOYEE_NOT_FOUND',
        `No employee exists for EmployeeId ${assignment.employeeId}`,
      )
    }
    manpower.push({
      date: shift.date,
      shiftCode: shift.shiftCode,
      location: shift.samplingHouseCode,
      jobDeskCode: assignment.jobDeskCode,
      employeeId: assignment.employeeId,
      employeeName: employee.name,
    })
  }

  // Rit = transaction count; Batch = distinct BatchNumber count — both
  // pile-local (ROADMAP Phase 14 §4/§5). Only Piles with production
  // transactions get a row, in caller Pile order.
  const productionSummary: ProductionSummaryRow[] = []
  for (const pile of piles) {
    const pileTransactions = haulageTransactions.filter((transaction) => transaction.pileId === pile.id)
    if (pileTransactions.length === 0) continue

    const distinctBatchNumbers = new Set(pileTransactions.map((transaction) => Number(transaction.batchPosition.batchNumber)))
    const increment = pileTransactions.filter((transaction) => transaction.samplingEvaluation.sampleRequired).length
    const wrongTruck = pileTransactions.filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK').length

    productionSummary.push({
      pileId: pile.id,
      oreCode: pile.oreCode,
      rit: pileTransactions.length,
      batch: distinctBatchNumbers.size,
      increment,
      wrongTruck,
    })
  }

  // Batch identity is pile-local: total Batch is the SUM of each Pile's
  // own distinct Batch count, never one global Set of batch numbers
  // (ROADMAP Phase 14 §5).
  const productionTotals: ProductionTotals = productionSummary.reduce<ProductionTotals>(
    (totals, row) => ({
      rit: totals.rit + row.rit,
      batch: totals.batch + row.batch,
      increment: totals.increment + row.increment,
      wrongTruck: totals.wrongTruck + row.wrongTruck,
    }),
    { rit: 0, batch: 0, increment: 0, wrongTruck: 0 },
  )

  const sampleHandling: SampleHandlingRow[] = samplePositions.map((position) => {
    const delivery = position.delivery
    const destination = delivery.status === 'DELIVERED' ? delivery.destination : undefined
    const dispatcherEmployeeId = delivery.status === 'DELIVERED' ? delivery.dispatcherEmployeeId : undefined
    const dispatcherName = dispatcherEmployeeId !== undefined ? findEmployee(masterData, dispatcherEmployeeId)?.name : undefined

    return {
      status: delivery.status,
      statusLabel: labels.deliveryStatus[delivery.status],
      destination,
      dispatcherEmployeeId,
      dispatcherName,
      oreCode: position.oreCode,
      pileId: position.pileId,
      batchNumber: position.batchNumber,
      // Increment From/To come from the stored sampledRitNumbers
      // sequence, never re-derived from the sampling engine (§6).
      incrementFrom: position.sampledRitNumbers[0],
      incrementTo: position.sampledRitNumbers[position.sampledRitNumbers.length - 1],
      totalBag: position.totalBag,
    }
  })

  const wrongTruck: WrongTruckRow[] = haulageTransactions
    .filter((transaction) => transaction.truckValidation.status === 'WRONG_TRUCK')
    .map((transaction) => {
      const validation = transaction.truckValidation
      const reasons = validation.status === 'WRONG_TRUCK' ? validation.reasons : []
      return {
        transactionId: transaction.id,
        pileId: transaction.pileId,
        batchNumber: transaction.batchPosition.batchNumber,
        ritNumber: transaction.batchPosition.ritNumber,
        frontId: transaction.frontId,
        truckId: transaction.truckId,
        reasons,
        reasonLabels: reasons.map((reason) => labels.wrongTruckReason[reason]),
      }
    })

  // Reuses derive-pending-samples verbatim — never reimplemented here
  // (§8). Only this shift's own stored records feed it; any previously
  // imported workspace.pendingSamples carry-over is deliberately never
  // merged in (see the Phase 14 implementation report's ambiguity note).
  const pendingPiles = derivePendingSamples({ shiftId: shift.id, piles, haulageTransactions, samplePositions })
  const pendingSamples: PendingSampleRow[] = pendingPiles.flatMap((pendingPile) =>
    pendingPile.batches.map((batch) => ({
      pileId: pendingPile.pile.id,
      oreCode: pendingPile.pile.oreCode,
      batchNumber: batch.batchNumber,
      pendingRitNumbers: batch.pendingRitNumbers,
    })),
  )

  const haulageDetail: HaulageDetailRow[] = haulageTransactions.map((transaction) => {
    // Non-null: every transaction.pileId was validated against pileById above.
    const pile = pileById.get(transaction.pileId)!
    const sampleStatus = transaction.samplingEvaluation.sampleRequired ? 'REQUIRED' : 'NOT_REQUIRED'
    const truckStatus = transaction.truckValidation.status
    const wrongTruckReasons = transaction.truckValidation.status === 'WRONG_TRUCK' ? transaction.truckValidation.reasons : []
    return {
      transactionId: transaction.id,
      truckId: transaction.truckId,
      oreCode: pile.oreCode,
      pileId: transaction.pileId,
      batchNumber: transaction.batchPosition.batchNumber,
      ritNumber: transaction.batchPosition.ritNumber,
      sampleStatus,
      sampleStatusLabel: labels.sampleStatus[sampleStatus],
      truckStatus,
      truckStatusLabel: labels.truckStatus[truckStatus],
      frontId: transaction.frontId,
      fleetId: transaction.fleetId,
      wrongTruckReasons,
      wrongTruckReasonLabels: wrongTruckReasons.map((reason) => labels.wrongTruckReason[reason]),
    }
  })

  return ok({
    language,
    labels,
    header: {
      title: labels.title,
      date: shift.date,
      shiftCode: shift.shiftCode,
      isoWeek: isoWeekOf(shift.date),
    },
    manpower,
    productionSummary,
    productionTotals,
    sampleHandling,
    wrongTruck,
    pendingSamples,
    haulageDetail,
  })
}
