import type {
  PendingSampleRow,
  ProductionSummaryRow,
  ReportLanguage,
  ReportManpowerRow,
  SampleHandlingRow,
  ShiftReport,
  WrongTruckRow,
} from './report-types'

/**
 * Formats the Phase 14 `ShiftReport` DTO into a compact, WhatsApp-friendly
 * plain-text message (ROADMAP Phase 15 §2-9). Pure formatting only — every
 * value here was already computed by
 * `@/application/reporting/build-shift-report`; this module never
 * aggregates, counts, re-derives, or independently translates anything. It
 * reads `report.labels` for every field/section label, exactly like
 * `@/integrations/excel/report-sheet-writer`. Haulage Detail is
 * deliberately omitted (§3) — it stays archive/report detail, not part of
 * the WhatsApp communication summary.
 *
 * The three empty-state strings below (no manpower / no wrong truck / no
 * pending samples) are Phase-15-only presentation text with no domain
 * counterpart in `ReportLabelSet`, so they stay local to this module
 * rather than being added to `report-localization.ts`.
 */
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

function isoWeekLabel(isoYear: number, isoWeekNumber: number): string {
  return `${isoYear}-W${String(isoWeekNumber).padStart(2, '0')}`
}

function headerBlock(report: ShiftReport): string[] {
  const { labels, header } = report
  return [
    bold(header.title),
    field(labels.columns.date, String(header.date)),
    field(labels.columns.shift, String(header.shiftCode)),
    field(labels.columns.isoWeek, isoWeekLabel(header.isoWeek.isoYear, header.isoWeek.isoWeekNumber)),
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
    wrongTruckBlock(report),
    pendingSamplesBlock(report),
  ]
  return blocks.map((block) => block.join('\n')).join('\n\n')
}
