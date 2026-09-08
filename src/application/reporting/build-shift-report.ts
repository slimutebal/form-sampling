import { deriveEffectiveSamplingRequirement } from '@/application/production/production-sample-impact'
import { selectEffectiveProductionRecords, selectEffectiveTransactions } from '@/application/production/effective-production'
import { derivePendingSamples } from '@/application/sample-handling/derive-pending-samples'
import type { PileId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { findEmployee, findPileArea, type MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'
import { deriveShiftProductionReport } from './derive-shift-production-report'
import { isoWeekOf } from './iso-week'
import { getReportLabels, shiftCodeDisplayLabel } from './report-localization'
import type {
  HaulageDetailRow,
  ManpowerAssignment,
  PendingSampleRow,
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
  readonly productionRecords: readonly ProductionRecord[]
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
 * already-stored domain state (ROADMAP Phase 14), rewired for Phase 22 to
 * read `ProductionRecord[]` — never the raw, unfiltered HaulageTransaction
 * table (§1). Every production total/list here reflects the *current
 * effective* state (`record.effective.*`): a REJECT or VOIDED record never
 * counts as production, and a MOVE/SWAP/EDIT_FIELDS correction is always
 * reported at its current position/Front/Truck, never the transaction's
 * original one. Never mutates any input array/object.
 *
 * Validated before anything is derived, mirroring
 * `buildShiftExportSnapshot`'s carry-over checks (§11):
 *  - no two Piles share a PileId (`REPORT_DUPLICATE_PILE_ID`);
 *  - every ProductionRecord's underlying transaction `shiftId` equals
 *    `shift.id` (`REPORT_HAULAGE_SHIFT_ID_MISMATCH`), and its `pileId`
 *    resolves to a Pile in `piles` (`REPORT_HAULAGE_PILE_NOT_FOUND`);
 *  - every SamplePosition's `shiftId` equals `shift.id`
 *    (`REPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH`), its `pileId` resolves to
 *    a Pile in `piles` (`REPORT_SAMPLE_POSITION_PILE_NOT_FOUND`), and its
 *    `oreCode` matches that Pile's Ore
 *    (`REPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH`);
 *  - every ManpowerAssignment's `employeeId` resolves in `masterData`
 *    (`REPORT_MANPOWER_EMPLOYEE_NOT_FOUND`, §3).
 */
export function buildShiftReport(input: BuildShiftReportInput): Result<ShiftReport, DomainError> {
  const { language, shift, piles, productionRecords, samplePositions, masterData, manpowerAssignments } = input
  const labels = getReportLabels(language)

  const pileById = new Map<PileId, Pile>()
  for (const pile of piles) {
    if (pileById.has(pile.id)) {
      return buildError('REPORT_DUPLICATE_PILE_ID', `Duplicate PileId in report input: ${pile.id}`)
    }
    pileById.set(pile.id, pile)
  }

  for (const record of productionRecords) {
    const transaction = record.transaction
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

  // `assignment.name` was already resolved once, against the Employee or
  // Crew master, at Manpower Setup time
  // (`@/application/manpower/create-manpower-from-draft`) — never
  // re-resolved here, and never assumed to be Employee-only (Phase 18 §4).
  const manpower: ReportManpowerRow[] = manpowerAssignments.map((assignment) => ({
    date: shift.date,
    shiftCode: shift.shiftCode,
    location: `${shift.sectorCode}/${shift.samplingHouseCode}`,
    jobDeskCode: assignment.jobDeskCode,
    employeeId: assignment.personId,
    employeeName: assignment.name,
  }))

  // Effective (ACCEPT + ACTIVE) production only (Phase 22 §1/§2) — never
  // recomputed here; delegated entirely to the shared projection so the
  // Report and any future consumer never drift apart.
  const productionReport = deriveShiftProductionReport(piles, masterData, productionRecords)
  if (!productionReport.ok) {
    return productionReport
  }
  const { summary: productionSummary, totals: productionTotals } = productionReport.value

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

  // Wrong Truck (Phase 22 §2): effective ACCEPT + ACTIVE records only,
  // whose *current* effective.truckValidation is WRONG_TRUCK — matches the
  // productionSummary/productionTotals Wrong Truck count exactly.
  const wrongTruck: WrongTruckRow[] = selectEffectiveProductionRecords(productionRecords)
    .filter((record) => record.effective.truckValidation.status === 'WRONG_TRUCK')
    .map((record) => {
      const validation = record.effective.truckValidation
      const reasons = validation.status === 'WRONG_TRUCK' ? validation.reasons : []
      return {
        transactionId: record.transaction.id,
        pileId: record.transaction.pileId,
        batchNumber: record.effective.batchPosition.batchNumber,
        ritNumber: record.effective.batchPosition.ritNumber,
        frontId: record.effective.frontId,
        truckId: record.effective.truckId,
        reasons,
        reasonLabels: reasons.map((reason) => labels.wrongTruckReason[reason]),
      }
    })

  // Reuses derive-pending-samples verbatim — never reimplemented here
  // (§8), fed only effective (ACCEPT + ACTIVE) transactions
  // (`selectEffectiveTransactions`) so a REJECT/VOIDED record never
  // generates a pending physical sample requirement. Only this shift's own
  // stored records feed it; any previously imported
  // workspace.pendingSamples carry-over is deliberately never merged in
  // (see the Phase 14 implementation report's ambiguity note).
  const pendingPiles = derivePendingSamples({
    shiftId: shift.id,
    piles,
    haulageTransactions: selectEffectiveTransactions(productionRecords),
    samplePositions,
  })
  const pendingSamples: PendingSampleRow[] = pendingPiles.flatMap((pendingPile) =>
    pendingPile.batches.map((batch) => ({
      pileId: pendingPile.pile.id,
      oreCode: pendingPile.pile.oreCode,
      batchNumber: batch.batchNumber,
      pendingRitNumbers: batch.pendingRitNumbers,
    })),
  )

  // Haulage Detail (Phase 22 §2/§9/§10): every ACTIVE record — ACCEPT and
  // REJECT alike, since this is a full operational per-delivery listing,
  // not the compact production summary — using effective
  // position/Front/Fleet/Truck/sample/truck-status throughout. VOIDED
  // records never appear here (they remain archive/machine-only, §8).
  const haulageDetail: HaulageDetailRow[] = []
  for (const record of productionRecords) {
    if (record.effective.status !== 'ACTIVE') continue
    const { transaction, effective } = record
    // Non-null: every record.transaction.pileId was validated against
    // pileById above.
    const pile = pileById.get(transaction.pileId)!
    // A Pile with no resolvable Pile_Areas master row (e.g. a stale local
    // master snapshot) never blocks the rest of the report — Stockpile is
    // simply left undefined for that row (§11), mirroring how
    // `dispatcherName` is already optional elsewhere in this module.
    const stockpileCode = findPileArea(masterData, pile.id)?.stockpileCode

    const effectiveRequirement = deriveEffectiveSamplingRequirement(pile, masterData, effective.batchPosition)
    if (!effectiveRequirement.ok) {
      return effectiveRequirement
    }
    const sampleStatus = effectiveRequirement.value.sampleRequired ? 'REQUIRED' : 'NOT_REQUIRED'
    const truckStatus = effective.truckValidation.status
    const wrongTruckReasons = effective.truckValidation.status === 'WRONG_TRUCK' ? effective.truckValidation.reasons : []
    haulageDetail.push({
      transactionId: transaction.id,
      truckId: effective.truckId,
      oreCode: pile.oreCode,
      stockpileCode,
      pileId: transaction.pileId,
      batchNumber: effective.batchPosition.batchNumber,
      ritNumber: effective.batchPosition.ritNumber,
      sampleStatus,
      sampleStatusLabel: labels.sampleStatus[sampleStatus],
      truckStatus,
      truckStatusLabel: labels.truckStatus[truckStatus],
      frontId: effective.frontId,
      fleetId: effective.fleetId,
      wrongTruckReasons,
      wrongTruckReasonLabels: wrongTruckReasons.map((reason) => labels.wrongTruckReason[reason]),
    })
  }

  return ok({
    language,
    labels,
    header: {
      title: labels.title,
      date: shift.date,
      shiftCode: shift.shiftCode,
      shiftCodeLabel: shiftCodeDisplayLabel(shift.shiftCode),
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
