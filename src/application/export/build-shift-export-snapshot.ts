import type { Clock } from '@/application/common/clock'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { HANDOVER_FILE_TYPE, SUPPORTED_HANDOVER_SCHEMA_VERSIONS } from '@/domain/handover/handover-schema'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { Pile } from '@/domain/pile/pile'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'

/**
 * The Excel/handover schema version this build writes (ARCHITECTURE.md
 * §9.4, ROADMAP.md Phase 13). Deliberately the same constant the Phase 12
 * importer allow-lists (`SUPPORTED_HANDOVER_SCHEMA_VERSIONS`), not a
 * separately maintained literal, so an export this build produces can
 * never silently drift out of sync with what this same build's importer
 * accepts. This is the workbook contract version — unrelated to the
 * IndexedDB `LocalOperationalDatabase` version (currently 3).
 */
export const EXPORT_SCHEMA_VERSION = SUPPORTED_HANDOVER_SCHEMA_VERSIONS[0]

export interface ShiftExportInput {
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly haulageTransactions: readonly HaulageTransaction[]
  readonly samplePositions: readonly SamplePosition[]
  /**
   * The outgoing shift's own unfinished batches, per Pile — explicit,
   * validated caller input (rule 4). There is no authoritative
   * end-of-shift pending derivation in this codebase yet (CONTINUE vs
   * HOLD is an operator decision no current engine makes), so this
   * function never invents pending state from `haulageTransactions`/
   * `samplePositions` and never reads a previously *imported*
   * `LocalShiftWorkspace.pendingBatches` (that field holds carry-over
   * *received* from the previous shift, not what this shift owes the
   * next one) — see `PendingBatchCarryOver`'s own doc comment for why
   * one Pile may have several of these simultaneously.
   */
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly applicationVersion: string
  readonly clock: Clock
}

export interface ExportAppDataRow {
  readonly Key: string
  readonly Value: string | number
}

export interface ExportShiftInfoRow {
  readonly Shift_ID: string
  readonly Date: string
  readonly Shift: string
  readonly Sector: string
  readonly Location: string
}

export interface ExportPendingSampleRow {
  readonly Pile_ID: string
  readonly Ore: string
  readonly Batch: number
  readonly Last_Rit: number
  readonly Status: string
}

export interface ExportSamplePositionRow {
  readonly Pile_ID: string
  readonly Ore: string
  readonly Batch: number
  readonly Rit_From: number
  readonly Rit_To: number
  readonly Status: string
  readonly Total_Bag: number
  readonly Destination: string
  readonly Dispatcher_Employee_ID: string
}

export interface ExportHaulageDetailRow {
  readonly Shift_ID: string
  readonly Pile_ID: string
  readonly Batch: number
  readonly Rit: number
  readonly Front_ID: string
  readonly Fleet_ID: string
  readonly Truck_ID: string
  readonly Sample_Status: 'REQUIRED' | 'NOT_REQUIRED'
  readonly Sample_Increment: number | ''
  readonly Truck_Status: 'VALID' | 'WRONG_TRUCK'
  readonly Wrong_Truck_Reasons: string
}

export interface ExportSamplingDetailRow {
  readonly Shift_ID: string
  readonly Pile_ID: string
  readonly Batch: number
  readonly Rit: number
  readonly Sample_Increment: number
  readonly Front_ID: string
  readonly Fleet_ID: string
  readonly Truck_ID: string
  readonly Truck_Status: 'VALID' | 'WRONG_TRUCK'
}

export interface ExportPileSummaryRow {
  readonly Pile_ID: string
  readonly Ore: string
  readonly Haulage_Transaction_Count: number
  readonly Sample_Position_Count: number
  readonly Pending_Batch_Count: number
}

export interface ExportReportRow {
  readonly Key: string
  readonly Value: string | number
}

/**
 * The plain, immutable DTO the `integrations/excel` writer serializes
 * (rule 11) — one row array per required sheet (ROADMAP.md Phase 13),
 * already in final machine-readable, language-neutral column shape
 * (rule 10). No SheetJS type appears here.
 */
export interface ShiftExportSnapshot {
  readonly appData: readonly ExportAppDataRow[]
  readonly shiftInfo: ExportShiftInfoRow
  readonly pendingSample: readonly ExportPendingSampleRow[]
  readonly samplePosition: readonly ExportSamplePositionRow[]
  readonly haulageDetail: readonly ExportHaulageDetailRow[]
  readonly samplingDetail: readonly ExportSamplingDetailRow[]
  readonly pileSummary: readonly ExportPileSummaryRow[]
  readonly report: readonly ExportReportRow[]
}

function buildError(code: string, message: string): Result<never, DomainError> {
  return err({ code, message })
}

/**
 * Builds the exportable snapshot of one Shift from already-validated
 * domain objects (rule 11: pure DTO construction, no I/O, no SheetJS).
 * Never mutates any input array/object — every sheet's rows are built
 * with `map`/`filter` over the given collections.
 *
 * Validated before anything is derived (fail on the first inconsistency,
 * mirroring `LocalOperationalStore.initializeShiftWorkspace`'s carry-over
 * checks):
 *  - no two Piles in `piles` share a PileId (`EXPORT_DUPLICATE_PILE_ID`);
 *  - every HaulageTransaction/SamplePosition's `shiftId` equals
 *    `shift.id` (`EXPORT_HAULAGE_SHIFT_ID_MISMATCH` /
 *    `EXPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH`) — a previous shift's
 *    haulage/sample records must never be exported as this shift's own;
 *  - every HaulageTransaction/SamplePosition's `pileId` resolves to a
 *    Pile in `piles` (`EXPORT_HAULAGE_PILE_NOT_FOUND` /
 *    `EXPORT_SAMPLE_POSITION_PILE_NOT_FOUND`), and a SamplePosition's
 *    `oreCode` matches that Pile's Ore
 *    (`EXPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH`);
 *  - every `pendingBatches` row's carried `pile.id` matches its own
 *    `pendingBatch.pileId` (`EXPORT_PENDING_BATCH_PILE_WIRING_MISMATCH`),
 *    resolves to a Pile in `piles`
 *    (`EXPORT_PENDING_BATCH_PILE_NOT_FOUND`), and agrees with that
 *    Pile's Ore (`EXPORT_PENDING_BATCH_PILE_ORE_MISMATCH`);
 *  - no two `pendingBatches` rows share the same PileId + BatchNumber
 *    identity (`EXPORT_DUPLICATE_PENDING_BATCH`, Phase 13) — never
 *    silently deduplicated; the same Pile with different BatchNumbers
 *    remains valid.
 */
export function buildShiftExportSnapshot(input: ShiftExportInput): Result<ShiftExportSnapshot, DomainError> {
  const { shift, piles, haulageTransactions, samplePositions, pendingBatches, applicationVersion, clock } = input

  const pileById = new Map<string, Pile>()
  for (const pile of piles) {
    if (pileById.has(pile.id)) {
      return buildError('EXPORT_DUPLICATE_PILE_ID', `Duplicate PileId in export input: ${pile.id}`)
    }
    pileById.set(pile.id, pile)
  }

  for (const transaction of haulageTransactions) {
    if (transaction.shiftId !== shift.id) {
      return buildError(
        'EXPORT_HAULAGE_SHIFT_ID_MISMATCH',
        `HaulageTransaction ${transaction.id} has ShiftId ${transaction.shiftId}, expected ${shift.id}`,
      )
    }
    if (!pileById.has(transaction.pileId)) {
      return buildError(
        'EXPORT_HAULAGE_PILE_NOT_FOUND',
        `HaulageTransaction ${transaction.id} references PileId ${transaction.pileId}, which is not part of this export`,
      )
    }
  }

  for (const position of samplePositions) {
    if (position.shiftId !== shift.id) {
      return buildError(
        'EXPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH',
        `SamplePosition ${position.id} has ShiftId ${position.shiftId}, expected ${shift.id}`,
      )
    }
    const pile = pileById.get(position.pileId)
    if (!pile) {
      return buildError(
        'EXPORT_SAMPLE_POSITION_PILE_NOT_FOUND',
        `SamplePosition ${position.id} references PileId ${position.pileId}, which is not part of this export`,
      )
    }
    if (pile.oreCode !== position.oreCode) {
      return buildError(
        'EXPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH',
        `SamplePosition ${position.id} Ore ${position.oreCode} does not match Pile ${pile.id} Ore ${pile.oreCode}`,
      )
    }
  }

  const seenPendingBatchIdentities = new Set<string>()
  for (const row of pendingBatches) {
    if (row.pile.id !== row.pendingBatch.pileId) {
      return buildError(
        'EXPORT_PENDING_BATCH_PILE_WIRING_MISMATCH',
        `Pending batch's PendingBatch.pileId (${row.pendingBatch.pileId}) does not match its carried Pile.id (${row.pile.id})`,
      )
    }
    const pile = pileById.get(row.pile.id)
    if (!pile) {
      return buildError(
        'EXPORT_PENDING_BATCH_PILE_NOT_FOUND',
        `Pending batch references PileId ${row.pile.id}, which is not part of this export`,
      )
    }
    if (pile.oreCode !== row.pile.oreCode) {
      return buildError(
        'EXPORT_PENDING_BATCH_PILE_ORE_MISMATCH',
        `Pending batch Ore ${row.pile.oreCode} for PileId ${row.pile.id} does not match Pile Ore ${pile.oreCode}`,
      )
    }
    const identity = `${row.pile.id}::${Number(row.pendingBatch.batchNumber)}`
    if (seenPendingBatchIdentities.has(identity)) {
      return buildError(
        'EXPORT_DUPLICATE_PENDING_BATCH',
        `Duplicate pending batch for PileId ${row.pile.id}, Batch ${Number(row.pendingBatch.batchNumber)} — the same Pile+Batch may appear only once`,
      )
    }
    seenPendingBatchIdentities.add(identity)
  }

  const exportTimestamp = clock.now().toISOString()

  const appData: ExportAppDataRow[] = [
    { Key: 'FileType', Value: HANDOVER_FILE_TYPE },
    { Key: 'SchemaVersion', Value: EXPORT_SCHEMA_VERSION },
    { Key: 'ApplicationVersion', Value: applicationVersion },
    { Key: 'Shift_ID', Value: String(shift.id) },
    { Key: 'ExportTimestamp', Value: exportTimestamp },
  ]

  const shiftInfo: ExportShiftInfoRow = {
    Shift_ID: String(shift.id),
    Date: String(shift.date),
    Shift: String(shift.shiftCode),
    Sector: String(shift.sectorCode),
    Location: String(shift.samplingHouseCode),
  }

  const pendingSample: ExportPendingSampleRow[] = pendingBatches.map((row) => ({
    Pile_ID: String(row.pile.id),
    Ore: String(row.pile.oreCode),
    Batch: Number(row.pendingBatch.batchNumber),
    Last_Rit: Number(row.pendingBatch.lastRit),
    Status: row.pendingBatch.status,
  }))

  const samplePosition: ExportSamplePositionRow[] = samplePositions.map((position) => ({
    Pile_ID: String(position.pileId),
    Ore: String(position.oreCode),
    Batch: Number(position.batchNumber),
    Rit_From: Number(position.ritFrom),
    Rit_To: Number(position.ritTo),
    Status: position.delivery.status,
    Total_Bag: Number(position.totalBag),
    Destination: position.delivery.status === 'DELIVERED' ? String(position.delivery.destination) : '',
    Dispatcher_Employee_ID:
      position.delivery.status === 'DELIVERED' && position.delivery.dispatcherEmployeeId !== undefined
        ? String(position.delivery.dispatcherEmployeeId)
        : '',
  }))

  const haulageDetail: ExportHaulageDetailRow[] = haulageTransactions.map((transaction) => ({
    Shift_ID: String(transaction.shiftId),
    Pile_ID: String(transaction.pileId),
    Batch: Number(transaction.batchPosition.batchNumber),
    Rit: Number(transaction.batchPosition.ritNumber),
    Front_ID: String(transaction.frontId),
    Fleet_ID: String(transaction.fleetId),
    Truck_ID: String(transaction.truckId),
    Sample_Status: transaction.samplingEvaluation.sampleRequired ? 'REQUIRED' : 'NOT_REQUIRED',
    Sample_Increment: transaction.samplingEvaluation.sampleRequired
      ? Number(transaction.samplingEvaluation.incrementNumber)
      : '',
    Truck_Status: transaction.truckValidation.status,
    Wrong_Truck_Reasons:
      transaction.truckValidation.status === 'WRONG_TRUCK' ? transaction.truckValidation.reasons.join(',') : '',
  }))

  const samplingDetail: ExportSamplingDetailRow[] = haulageTransactions
    .filter((transaction) => transaction.samplingEvaluation.sampleRequired)
    .map((transaction) => {
      const evaluation = transaction.samplingEvaluation
      return {
        Shift_ID: String(transaction.shiftId),
        Pile_ID: String(transaction.pileId),
        Batch: Number(transaction.batchPosition.batchNumber),
        Rit: Number(transaction.batchPosition.ritNumber),
        Sample_Increment: evaluation.sampleRequired ? Number(evaluation.incrementNumber) : 0,
        Front_ID: String(transaction.frontId),
        Fleet_ID: String(transaction.fleetId),
        Truck_ID: String(transaction.truckId),
        Truck_Status: transaction.truckValidation.status,
      }
    })

  const pileSummary: ExportPileSummaryRow[] = piles.map((pile) => ({
    Pile_ID: String(pile.id),
    Ore: String(pile.oreCode),
    Haulage_Transaction_Count: haulageTransactions.filter((transaction) => transaction.pileId === pile.id).length,
    Sample_Position_Count: samplePositions.filter((position) => position.pileId === pile.id).length,
    Pending_Batch_Count: pendingBatches.filter((row) => row.pile.id === pile.id).length,
  }))

  const report: ExportReportRow[] = [
    { Key: 'Shift_ID', Value: String(shift.id) },
    { Key: 'Date', Value: String(shift.date) },
    { Key: 'Shift', Value: String(shift.shiftCode) },
    { Key: 'Sector', Value: String(shift.sectorCode) },
    { Key: 'Location', Value: String(shift.samplingHouseCode) },
    { Key: 'Pile_Count', Value: piles.length },
    { Key: 'Haulage_Transaction_Count', Value: haulageTransactions.length },
    { Key: 'Sample_Position_Count', Value: samplePositions.length },
    { Key: 'Pending_Batch_Count', Value: pendingBatches.length },
  ]

  return ok({
    appData,
    shiftInfo,
    pendingSample,
    samplePosition,
    haulageDetail,
    samplingDetail,
    pileSummary,
    report,
  })
}
