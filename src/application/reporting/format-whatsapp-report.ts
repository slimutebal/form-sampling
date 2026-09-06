import { formatBatchRit, formatReportDate } from './report-localization'
import type {
  HaulageDetailRow,
  PendingSampleRow,
  ProductionSummaryRow,
  ReportLanguage,
  ReportManpowerRow,
  SampleHandlingRow,
  ShiftReport,
  WrongTruckRow,
} from './report-types'

/**
 * Formats the Phase 14 `ShiftReport` DTO into the fixed WhatsApp-friendly
 * business report contract (Phase 18 §1) used identically by Preview,
 * Copy and Share. Pure formatting only — every value here was already
 * computed by `@/application/reporting/build-shift-report`; this module
 * never aggregates, counts, re-derives, or independently translates
 * anything. It reads `report.labels` for every field/section label,
 * exactly like `@/integrations/excel/report-sheet-writer`.
 *
 * Section order matches the fixed contract exactly: HEADER, MANPOWER,
 * PILE SUMMARY, SAMPLE HANDLING, HAULAGE DETAIL. Wrong Truck and Pending
 * Samples remain as trailing supplementary sections (pre-existing, not
 * part of the fixed 5-section contract, but not something to remove —
 * "do not invent a new summary format" cuts both ways).
 *
 * The literal greeting/subtitle/Date-Shift/Week header strings and the
 * three empty-state strings below have no domain counterpart in
 * `ReportLabelSet`, so they stay local to this module rather than being
 * added there — same rationale as the rest of this file.
 */
const HEADER_TEXT: Record<ReportLanguage, { greeting: string; subtitle: string; dateShift: string; week: string }> = {
  en: {
    greeting: 'Dear All,',
    subtitle: '-- Ore & Sample Production --',
    dateShift: 'Date/Shift',
    week: 'Week',
  },
  id: {
    greeting: 'Kepada Semua,',
    subtitle: '-- Produksi Ore & Sampel --',
    dateShift: 'Tanggal/Shift',
    week: 'Minggu',
  },
}

const EMPTY_STATE_TEXT: Record<ReportLanguage, { manpower: string; wrongTruck: string; pendingSamples: string }> = {
  en: {
    manpower: 'No manpower assigned.',
    wrongTruck: 'No wrong truck entries.',
    pendingSamples: 'No pending samples.',
  },
  id: {
    manpower: 'Tidak ada tenaga kerja yang ditugaskan.',
    wrongTruck: 'Tidak ada truk salah.',
    pendingSamples: 'Tidak ada sampel tertunda.',
  },
}

function bold(text: string): string {
  return `*${text}*`
}

function field(label: string, value: string | number): string {
  return `${label}: ${value}`
}

function headerBlock(report: ShiftReport): string[] {
  const { header, language } = report
  const text = HEADER_TEXT[language]
  return [
    text.greeting,
    bold(header.title),
    text.subtitle,
    field(text.dateShift, `${formatReportDate(String(header.date))} / ${header.shiftCodeLabel}`),
    field(text.week, header.isoWeek.isoWeekNumber),
  ]
}

function manpowerBlock(report: ShiftReport): string[] {
  const { labels, manpower, language } = report
  const lines = [bold(labels.sections.manpower)]
  if (manpower.length === 0) {
    lines.push(EMPTY_STATE_TEXT[language].manpower)
    return lines
  }
  lines.push(field(labels.columns.location, manpower[0].location))
  for (const row of manpower as readonly ReportManpowerRow[]) {
    lines.push(
      `- ${field(labels.columns.jobDesk, row.jobDeskCode)} | ${field(labels.columns.employeeId, String(row.employeeId))} | ${field(labels.columns.employeeName, row.employeeName)}`,
    )
  }
  return lines
}

function productionSummaryBlock(report: ShiftReport): string[] {
  const { labels, productionSummary, productionTotals } = report
  const lines = [bold(labels.sections.productionSummary)]
  for (const row of productionSummary as readonly ProductionSummaryRow[]) {
    lines.push(
      `- ${field(labels.columns.pileId, String(row.pileId))} | ${field(labels.columns.ore, String(row.oreCode))} | ${field(labels.columns.rit, row.rit)} | ${field(labels.columns.batch, row.batch)} | ${field(labels.columns.increment, row.increment)} | ${field(labels.columns.wrongTruck, row.wrongTruck)}`,
    )
  }
  lines.push('')
  lines.push(bold(labels.sections.productionTotals))
  lines.push(
    `${field(labels.columns.rit, productionTotals.rit)} | ${field(labels.columns.batch, productionTotals.batch)} | ${field(labels.columns.increment, productionTotals.increment)} | ${field(labels.columns.wrongTruck, productionTotals.wrongTruck)}`,
  )
  return lines
}

function sampleHandlingBlock(report: ShiftReport): string[] {
  const { labels, sampleHandling } = report
  const lines = [bold(labels.sections.sampleHandling)]
  for (const row of sampleHandling as readonly SampleHandlingRow[]) {
    const parts = [
      field(labels.columns.status, row.statusLabel),
      field(labels.columns.ore, String(row.oreCode)),
      field(labels.columns.pileId, String(row.pileId)),
      field(labels.columns.batch, Number(row.batchNumber)),
      `${field(labels.columns.incrementFrom, Number(row.incrementFrom))} → ${field(labels.columns.incrementTo, Number(row.incrementTo))}`,
      field(labels.columns.totalBag, Number(row.totalBag)),
    ]
    if (row.destination !== undefined) {
      parts.push(field(labels.columns.destination, String(row.destination)))
    }
    if (row.dispatcherEmployeeId !== undefined) {
      parts.push(field(labels.columns.dispatcherEmployeeId, String(row.dispatcherEmployeeId)))
    }
    if (row.dispatcherName !== undefined) {
      parts.push(field(labels.columns.dispatcherName, row.dispatcherName))
    }
    lines.push(`- ${parts.join(' | ')}`)
  }
  return lines
}

/**
 * Haulage Detail (Phase 18 §1/§11) — every recorded transaction, wrong
 * truck rows included (never filtered out). "Remark" reuses the same
 * `wrongTruckReasonLabels` already computed by `buildShiftReport`
 * (BR-TRUCK-003's business mapping) rather than inventing a new label;
 * blank for a VALID row.
 */
function haulageDetailBlock(report: ShiftReport): string[] {
  const { labels, haulageDetail } = report
  const lines = [bold(labels.sections.haulageDetail)]
  for (const row of haulageDetail as readonly HaulageDetailRow[]) {
    const remark = row.wrongTruckReasonLabels.length > 0 ? row.wrongTruckReasonLabels.join(', ') : '-'
    lines.push(
      `- ${field(labels.columns.transactionId, String(row.transactionId))} | ${field(labels.columns.truckId, String(row.truckId))} | ${field(labels.columns.ore, String(row.oreCode))} | ${field(labels.columns.stockpile, row.stockpileCode ? String(row.stockpileCode) : '-')} | ${field(labels.columns.pileId, String(row.pileId))} | ${field(labels.columns.batch, formatBatchRit(Number(row.batchNumber), Number(row.ritNumber)))} | ${field(labels.columns.sampleStatus, row.sampleStatusLabel)} | ${field(labels.columns.truckStatus, row.truckStatusLabel)} | ${field(labels.columns.reasons, remark)}`,
    )
  }
  return lines
}

function wrongTruckBlock(report: ShiftReport): string[] {
  const { labels, wrongTruck, language } = report
  const lines = [bold(labels.sections.wrongTruck)]
  if (wrongTruck.length === 0) {
    lines.push(EMPTY_STATE_TEXT[language].wrongTruck)
    return lines
  }
  for (const row of wrongTruck as readonly WrongTruckRow[]) {
    lines.push(
      `- ${field(labels.columns.transactionId, String(row.transactionId))} | ${field(labels.columns.pileId, String(row.pileId))} | ${field(labels.columns.batch, Number(row.batchNumber))} | ${field(labels.columns.rit, Number(row.ritNumber))} | ${field(labels.columns.frontId, String(row.frontId))} | ${field(labels.columns.truckId, String(row.truckId))} | ${field(labels.columns.reasons, row.reasonLabels.join(', '))}`,
    )
  }
  return lines
}

function pendingSamplesBlock(report: ShiftReport): string[] {
  const { labels, pendingSamples, language } = report
  const lines = [bold(labels.sections.pendingSamples)]
  if (pendingSamples.length === 0) {
    lines.push(EMPTY_STATE_TEXT[language].pendingSamples)
    return lines
  }
  for (const row of pendingSamples as readonly PendingSampleRow[]) {
    lines.push(
      `- ${field(labels.columns.pileId, String(row.pileId))} | ${field(labels.columns.ore, String(row.oreCode))} | ${field(labels.columns.batch, Number(row.batchNumber))} | ${field(
        labels.columns.pendingRitNumbers,
        row.pendingRitNumbers.map((rit) => Number(rit)).join(', '),
      )}`,
    )
  }
  return lines
}

/**
 * Builds the single WhatsApp-friendly text used identically by Preview,
 * Copy and Share (ROADMAP Phase 15 §2/§14 — "There must be exactly one
 * text-generation path"). Section titles/the report title are wrapped in
 * `*asterisks*`, which WhatsApp's own client renders as bold — the string
 * itself stays plain text, so this is presentation only.
 */
export function formatWhatsAppReport(report: ShiftReport): string {
  const blocks = [
    headerBlock(report),
    manpowerBlock(report),
    productionSummaryBlock(report),
    sampleHandlingBlock(report),
    haulageDetailBlock(report),
    wrongTruckBlock(report),
    pendingSamplesBlock(report),
  ]
  return blocks.map((block) => block.join('\n')).join('\n\n')
}
