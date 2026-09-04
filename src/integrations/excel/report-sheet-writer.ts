import type {
  HaulageDetailRow,
  PendingSampleRow,
  ProductionSummaryRow,
  ReportManpowerRow,
  SampleHandlingRow,
  ShiftReport,
  WrongTruckRow,
} from '@/application/reporting/report-types'

/**
 * Serializes the Phase 14 `ShiftReport` DTO into one human-readable,
 * language-specific Excel sheet (ROADMAP Phase 14 §12). Pure formatting
 * only — every value here was already computed by
 * `@/application/reporting/build-shift-report`; this module never
 * aggregates, counts, or re-derives anything, and never decides labels
 * itself (it only reads `report.labels`).
 */

type SheetCell = string | number
type SheetRow = SheetCell[]

function isoWeekLabel(isoYear: number, isoWeekNumber: number): string {
  return `${isoYear}-W${String(isoWeekNumber).padStart(2, '0')}`
}

function section(title: string, header: SheetRow, rows: readonly SheetRow[]): SheetRow[] {
  return [[title], header, ...rows, []]
}

function manpowerSection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [
    labels.columns.date,
    labels.columns.shift,
    labels.columns.location,
    labels.columns.jobDesk,
    labels.columns.employeeId,
    labels.columns.employeeName,
  ]
  const rows = report.manpower.map((row: ReportManpowerRow) => [
    String(row.date),
    String(row.shiftCode),
    String(row.location),
    row.jobDeskCode,
    String(row.employeeId),
    row.employeeName,
  ])
  return section(labels.sections.manpower, header, rows)
}

function productionSummarySection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [
    labels.columns.pileId,
    labels.columns.ore,
    labels.columns.rit,
    labels.columns.batch,
    labels.columns.increment,
    labels.columns.wrongTruck,
  ]
  const rows = report.productionSummary.map((row: ProductionSummaryRow) => [
    String(row.pileId),
    String(row.oreCode),
    row.rit,
    row.batch,
    row.increment,
    row.wrongTruck,
  ])
  return section(labels.sections.productionSummary, header, rows)
}

function productionTotalsSection(report: ShiftReport): SheetRow[] {
  const { labels, productionTotals } = report
  const header = [labels.columns.rit, labels.columns.batch, labels.columns.increment, labels.columns.wrongTruck]
  const rows = [[productionTotals.rit, productionTotals.batch, productionTotals.increment, productionTotals.wrongTruck]]
  return section(labels.sections.productionTotals, header, rows)
}

function sampleHandlingSection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [
    labels.columns.status,
    labels.columns.destination,
    labels.columns.dispatcherEmployeeId,
    labels.columns.dispatcherName,
    labels.columns.ore,
    labels.columns.pileId,
    labels.columns.batch,
    labels.columns.incrementFrom,
    labels.columns.incrementTo,
    labels.columns.totalBag,
  ]
  const rows = report.sampleHandling.map((row: SampleHandlingRow) => [
    row.statusLabel,
    row.destination !== undefined ? String(row.destination) : '',
    row.dispatcherEmployeeId !== undefined ? String(row.dispatcherEmployeeId) : '',
    row.dispatcherName ?? '',
    String(row.oreCode),
    String(row.pileId),
    Number(row.batchNumber),
    Number(row.incrementFrom),
    Number(row.incrementTo),
    Number(row.totalBag),
  ])
  return section(labels.sections.sampleHandling, header, rows)
}

function wrongTruckSection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [
    labels.columns.transactionId,
    labels.columns.pileId,
    labels.columns.batch,
    labels.columns.rit,
    labels.columns.frontId,
    labels.columns.truckId,
    labels.columns.reasons,
  ]
  const rows = report.wrongTruck.map((row: WrongTruckRow) => [
    String(row.transactionId),
    String(row.pileId),
    Number(row.batchNumber),
    Number(row.ritNumber),
    String(row.frontId),
    String(row.truckId),
    row.reasonLabels.join(', '),
  ])
  return section(labels.sections.wrongTruck, header, rows)
}

function pendingSamplesSection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [labels.columns.pileId, labels.columns.ore, labels.columns.batch, labels.columns.pendingRitNumbers]
  const rows = report.pendingSamples.map((row: PendingSampleRow) => [
    String(row.pileId),
    String(row.oreCode),
    Number(row.batchNumber),
    row.pendingRitNumbers.map((rit) => Number(rit)).join(', '),
  ])
  return section(labels.sections.pendingSamples, header, rows)
}

function haulageDetailSection(report: ShiftReport): SheetRow[] {
  const { labels } = report
  const header = [
    labels.columns.transactionId,
    labels.columns.truckId,
    labels.columns.ore,
    labels.columns.pileId,
    labels.columns.batch,
    labels.columns.rit,
    labels.columns.sampleStatus,
    labels.columns.truckStatus,
    labels.columns.frontId,
    labels.columns.fleetId,
    labels.columns.reasons,
  ]
  const rows = report.haulageDetail.map((row: HaulageDetailRow) => [
    String(row.transactionId),
    String(row.truckId),
    String(row.oreCode),
    String(row.pileId),
    Number(row.batchNumber),
    Number(row.ritNumber),
    row.sampleStatusLabel,
    row.truckStatusLabel,
    String(row.frontId),
    String(row.fleetId),
    row.wrongTruckReasonLabels.join(', '),
  ])
  return section(labels.sections.haulageDetail, header, rows)
}

/**
 * Builds the Report sheet as an array-of-arrays: a stack of
 * title/header/data blocks (Header, Manpower, Production Summary,
 * Production Totals, Sample Handling, Wrong Truck, Pending Samples,
 * Haulage Detail), each separated by one blank row.
 */
export function buildReportSheetAoa(report: ShiftReport): SheetRow[] {
  return [
    [report.header.title],
    [],
    [report.labels.sections.header],
    [report.labels.columns.date, String(report.header.date)],
    [report.labels.columns.shift, String(report.header.shiftCode)],
    [report.labels.columns.isoWeek, isoWeekLabel(report.header.isoWeek.isoYear, report.header.isoWeek.isoWeekNumber)],
    [],
    ...manpowerSection(report),
    ...productionSummarySection(report),
    ...productionTotalsSection(report),
    ...sampleHandlingSection(report),
    ...wrongTruckSection(report),
    ...pendingSamplesSection(report),
    ...haulageDetailSection(report),
  ]
}
