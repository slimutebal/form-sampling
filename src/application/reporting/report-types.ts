import type { BatchNumber } from '@/domain/batch/batch-number'
import type { RitNumber } from '@/domain/batch/rit-number'
import type { OreCode, ShiftCode } from '@/domain/common/codes'
import type { EmployeeId, FleetId, FrontId, HaulageTransactionId, PileId, TruckId } from '@/domain/common/identifiers'
import type { ShiftDate } from '@/domain/common/shift-date'
import type { PileAreaCode } from '@/domain/master/master-codes'
import type { DeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import type { SampleDelivery } from '@/domain/sample-handling/delivery-status'
import type { TotalBag } from '@/domain/sample-handling/total-bag'
import type { WrongTruckReasonCode } from '@/domain/fleet/truck-validation'
import type { IsoWeek } from './iso-week'

/** Report output language. Independent of the app's own i18n language (ROADMAP Phase 14 §10). */
export type ReportLanguage = 'id' | 'en'

/**
 * One caller-supplied manpower assignment for the reporting shift.
 * Mirrors `@/domain/manpower/manpower-assignment`'s persisted shape
 * (Phase 18 §4) rather than re-deriving `name` from a master lookup here:
 * `personId` may resolve against either the Employee or the Crew master
 * (`@/application/manpower/create-manpower-from-draft` already validated
 * and resolved it once, at Manpower Setup time), so this module must not
 * assume it is always an `EmployeeId`. `jobDeskCode` is deliberately a
 * plain, language-neutral string: no closed enum of job desks is invented
 * here because no confirmed business rule defines one. `isPic` is
 * intentionally not part of this type — PIC is internal shift metadata
 * only and must never surface as a report column (§4/§11).
 */
export interface ManpowerAssignment {
  readonly personId: string
  readonly name: string
  readonly jobDeskCode: string
}

export interface ReportHeader {
  readonly title: string
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
  /** Report display of `shiftCode` (Phase 18 §1: `DS`→`D`, `NS`→`N`) — the stored code itself never changes. */
  readonly shiftCodeLabel: string
  readonly isoWeek: IsoWeek
}

export interface ReportManpowerRow {
  readonly date: ShiftDate
  readonly shiftCode: ShiftCode
  /** `Sector/SamplingHouseCode` (Phase 18 §1, e.g. `BR1/SH_01`) — a formatted display string, not itself a master code. */
  readonly location: string
  readonly jobDeskCode: string
  /** NIK/Employee ID or Crew ID — whichever `personId` this assignment resolved from (Phase 18 §4). */
  readonly employeeId: string
  readonly employeeName: string
}

export interface ProductionSummaryRow {
  readonly pileId: PileId
  readonly oreCode: OreCode
  readonly rit: number
  readonly batch: number
  readonly increment: number
  readonly wrongTruck: number
}

export interface ProductionTotals {
  readonly rit: number
  readonly batch: number
  readonly increment: number
  readonly wrongTruck: number
}

/** `destination`/`dispatcherEmployeeId`/`dispatcherName` are only ever present when `status === 'DELIVERED'`. */
export interface SampleHandlingRow {
  readonly status: SampleDelivery['status']
  readonly statusLabel: string
  readonly destination?: DeliveryDestinationCode
  readonly dispatcherEmployeeId?: EmployeeId
  readonly dispatcherName?: string
  readonly oreCode: OreCode
  readonly pileId: PileId
  readonly batchNumber: BatchNumber
  readonly incrementFrom: RitNumber
  readonly incrementTo: RitNumber
  readonly totalBag: TotalBag
}

/** `reasons` is the unlocalized domain code list; `reasonLabels` is the same list localized for the report language, in the same order. */
export interface WrongTruckRow {
  readonly transactionId: HaulageTransactionId
  readonly pileId: PileId
  readonly batchNumber: BatchNumber
  readonly ritNumber: RitNumber
  readonly frontId: FrontId
  readonly truckId: TruckId
  readonly reasons: readonly WrongTruckReasonCode[]
  readonly reasonLabels: readonly string[]
}

export interface PendingSampleRow {
  readonly pileId: PileId
  readonly oreCode: OreCode
  readonly batchNumber: BatchNumber
  readonly pendingRitNumbers: readonly RitNumber[]
}

/**
 * Raw domain values (`sampleStatus`, `truckStatus`, `wrongTruckReasons`)
 * are kept unchanged alongside their `*Label`/`*Labels` counterparts,
 * which are localized for the report language — the Excel writer (and
 * any future presentation) must only ever display the label fields,
 * never the raw codes, as human-facing text (Phase 14 bilingual cleanup).
 */
export interface HaulageDetailRow {
  readonly transactionId: HaulageTransactionId
  readonly truckId: TruckId
  readonly oreCode: OreCode
  /** `undefined` when this Pile has no resolvable Pile_Areas master row (Phase 18 §11) — never blocks the rest of the report over one unresolved Stockpile. */
  readonly stockpileCode?: PileAreaCode
  readonly pileId: PileId
  readonly batchNumber: BatchNumber
  readonly ritNumber: RitNumber
  readonly sampleStatus: 'REQUIRED' | 'NOT_REQUIRED'
  readonly sampleStatusLabel: string
  readonly truckStatus: 'VALID' | 'WRONG_TRUCK'
  readonly truckStatusLabel: string
  readonly frontId: FrontId
  readonly fleetId: FleetId
  readonly wrongTruckReasons: readonly WrongTruckReasonCode[]
  readonly wrongTruckReasonLabels: readonly string[]
}

/**
 * Localized display strings for one report language (ROADMAP Phase 14
 * §10). Never contains business data — only section/column/status
 * labels — so this can be embedded directly into the report DTO without
 * coupling it to any calculation.
 */
export interface ReportLabelSet {
  readonly title: string
  readonly sections: {
    readonly header: string
    readonly manpower: string
    readonly productionSummary: string
    readonly productionTotals: string
    readonly sampleHandling: string
    readonly wrongTruck: string
    readonly pendingSamples: string
    readonly haulageDetail: string
  }
  readonly columns: {
    readonly date: string
    readonly shift: string
    readonly isoWeek: string
    readonly location: string
    readonly jobDesk: string
    readonly employeeId: string
    readonly employeeName: string
    readonly pileId: string
    readonly ore: string
    readonly stockpile: string
    readonly rit: string
    readonly batch: string
    readonly increment: string
    readonly wrongTruck: string
    readonly status: string
    readonly destination: string
    readonly dispatcherEmployeeId: string
    readonly dispatcherName: string
    readonly incrementFrom: string
    readonly incrementTo: string
    readonly totalBag: string
    readonly transactionId: string
    readonly frontId: string
    readonly truckId: string
    readonly fleetId: string
    readonly reasons: string
    readonly sampleStatus: string
    readonly truckStatus: string
    readonly pendingRitNumbers: string
  }
  readonly deliveryStatus: Record<SampleDelivery['status'], string>
  /** `sampleStatus`/`truckStatus`/`wrongTruckReason` localize the raw HaulageTransaction snapshot values — never the stored codes themselves (Phase 14 bilingual cleanup). */
  readonly sampleStatus: Record<'REQUIRED' | 'NOT_REQUIRED', string>
  readonly truckStatus: Record<'VALID' | 'WRONG_TRUCK', string>
  readonly wrongTruckReason: Record<WrongTruckReasonCode, string>
}

/**
 * The immutable Phase 14 report model (ROADMAP Phase 14 §1). Pure data:
 * no React, no SheetJS, no i18next. Suitable as the shared source for
 * the Phase 13 Excel Report sheet, a future Phase 15 WhatsApp text
 * rendering, and any future UI preview.
 */
export interface ShiftReport {
  readonly language: ReportLanguage
  readonly labels: ReportLabelSet
  readonly header: ReportHeader
  readonly manpower: readonly ReportManpowerRow[]
  readonly productionSummary: readonly ProductionSummaryRow[]
  readonly productionTotals: ProductionTotals
  readonly sampleHandling: readonly SampleHandlingRow[]
  readonly wrongTruck: readonly WrongTruckRow[]
  readonly pendingSamples: readonly PendingSampleRow[]
  readonly haulageDetail: readonly HaulageDetailRow[]
}
