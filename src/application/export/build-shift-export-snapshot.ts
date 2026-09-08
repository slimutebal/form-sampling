import type { Clock } from '@/application/common/clock'
import { selectEffectiveProductionRecords } from '@/application/production/effective-production'
import { deriveEffectiveSamplingRequirement } from '@/application/production/production-sample-impact'
import { buildShiftReport } from '@/application/reporting/build-shift-report'
import type { ManpowerAssignment, ReportLanguage, ShiftReport } from '@/application/reporting/report-types'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import { HANDOVER_FILE_TYPE, SUPPORTED_HANDOVER_SCHEMA_VERSIONS } from '@/domain/handover/handover-schema'
import type { MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import type { Shift } from '@/domain/shift/shift'
import { buildMachineHaulageDetailRows, type ExportHaulageDetailRow } from './build-machine-haulage-detail-rows'
import { buildProductionCorrectionRows, type ExportProductionCorrectionRow } from './build-production-correction-rows'

export type { ExportHaulageDetailRow } from './build-machine-haulage-detail-rows'
export type { ExportProductionCorrectionRow } from './build-production-correction-rows'

/** The Report sheet defaults to Indonesian when no explicit report language is given (the app's own default UI language, `defaultLanguage` in `@/i18n`) — the two settings remain otherwise independent (ROADMAP Phase 14 §10). */
const DEFAULT_REPORT_LANGUAGE: ReportLanguage = 'id'

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
  readonly productionRecords: readonly ProductionRecord[]
  readonly samplePositions: readonly SamplePosition[]
  /**
   * The outgoing shift's own unfinished batches, per Pile — explicit,
   * validated caller input (rule 4). There is no authoritative
   * end-of-shift pending derivation in this codebase yet (CONTINUE vs
   * HOLD is an operator decision no current engine makes), so this
   * function never invents pending state from `productionRecords`/
   * `samplePositions` and never reads a previously *imported*
   * `LocalShiftWorkspace.pendingBatches` (that field holds carry-over
   * *received* from the previous shift, not what this shift owes the
   * next one) — see `PendingBatchCarryOver`'s own doc comment for why
   * one Pile may have several of these simultaneously.
   */
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly applicationVersion: string
  readonly clock: Clock
  /** Validated master-data snapshot the Phase 14 reporting engine resolves Manpower/Dispatcher names against. */
  readonly masterData: MasterData
  /** Explicit, caller-supplied manpower for this shift (ROADMAP Phase 14 §3). Defaults to none. */
  readonly manpowerAssignments?: readonly ManpowerAssignment[]
  /** The Report sheet's human-readable language — independent of the app's own UI language. Defaults to `'id'`. */
  readonly reportLanguage?: ReportLanguage
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
  /** Phase 22 §5 correction event log, flattened from every ProductionRecord's `audit.corrections`. */
  readonly productionCorrection: readonly ExportProductionCorrectionRow[]
  /** The Phase 14 report DTO (`@/application/reporting`) — already fully computed; the Excel writer only serializes it (ROADMAP Phase 14 §12). */
  readonly report: ShiftReport
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
 *
 * The `report` field is delegated entirely to
 * `@/application/reporting/build-shift-report` (ROADMAP Phase 14 §12) —
 * this function never computes report aggregates itself, and any
 * `REPORT_*` error that function returns (e.g.
 * `REPORT_MANPOWER_EMPLOYEE_NOT_FOUND`) is propagated unchanged.
 */
export function buildShiftExportSnapshot(input: ShiftExportInput): Result<ShiftExportSnapshot, DomainError> {
  const {
    shift,
    piles,
    productionRecords,
    samplePositions,
    pendingBatches,
    applicationVersion,
    clock,
    masterData,
    manpowerAssignments = [],
    reportLanguage = DEFAULT_REPORT_LANGUAGE,
  } = input

  const pileById = new Map<string, Pile>()
  for (const pile of piles) {
    if (pileById.has(pile.id)) {
      return buildError('EXPORT_DUPLICATE_PILE_ID', `Duplicate PileId in export input: ${pile.id}`)
    }
    pileById.set(pile.id, pile)
  }

  for (const record of productionRecords) {
    const transaction = record.transaction
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

  // Machine archive: every ProductionRecord, no disposition/status
  // filtering (§8/§9/§10) — REJECT and VOIDED rows are preserved with both
  // Original (immutable transaction) and Effective (current) columns.
  const haulageDetailResult = buildMachineHaulageDetailRows(piles, masterData, productionRecords)
  if (!haulageDetailResult.ok) {
    return haulageDetailResult
  }
  const haulageDetail = haulageDetailResult.value

  const productionCorrection: readonly ExportProductionCorrectionRow[] = buildProductionCorrectionRows(productionRecords)

  // Sampling_Detail is an operational "what needs a physical sample" list
  // (Phase 22 §1/§6), so it is scoped to effective (ACCEPT + ACTIVE)
  // production only, at the *effective* position — a REJECT/VOIDED record,
  // or a position a SWITCH_POSITION correction has moved off, never
  // demands a physical sample here.
  const samplingDetail: ExportSamplingDetailRow[] = []
  for (const record of selectEffectiveProductionRecords(productionRecords)) {
    const { transaction, effective } = record
    const pile = piles.find((candidate) => candidate.id === transaction.pileId)!
    const requirement = deriveEffectiveSamplingRequirement(pile, masterData, effective.batchPosition)
    if (!requirement.ok) {
      return requirement
    }
    if (!requirement.value.sampleRequired) continue
    samplingDetail.push({
      Shift_ID: String(transaction.shiftId),
      Pile_ID: String(transaction.pileId),
      Batch: Number(effective.batchPosition.batchNumber),
      Rit: Number(effective.batchPosition.ritNumber),
      Sample_Increment: Number(requirement.value.incrementNumber),
      Front_ID: String(effective.frontId),
      Fleet_ID: String(effective.fleetId),
      Truck_ID: String(effective.truckId),
      Truck_Status: effective.truckValidation.status,
    })
  }

  const pileSummary: ExportPileSummaryRow[] = piles.map((pile) => ({
    Pile_ID: String(pile.id),
    Ore: String(pile.oreCode),
    Haulage_Transaction_Count: productionRecords.filter((record) => record.transaction.pileId === pile.id).length,
    Sample_Position_Count: samplePositions.filter((position) => position.pileId === pile.id).length,
    Pending_Batch_Count: pendingBatches.filter((row) => row.pile.id === pile.id).length,
  }))

  const reportResult = buildShiftReport({
    language: reportLanguage,
    shift,
    piles,
    productionRecords,
    samplePositions,
    masterData,
    manpowerAssignments,
  })
  if (!reportResult.ok) {
    return reportResult
  }

  return ok({
    appData,
    shiftInfo,
    pendingSample,
    samplePosition,
    haulageDetail,
    samplingDetail,
    pileSummary,
    productionCorrection,
    report: reportResult.value,
  })
}
