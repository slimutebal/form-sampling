import type { ShiftCode } from '@/domain/common/codes'
import type { ReportLabelSet, ReportLanguage } from './report-types'

/**
 * Report display of `shiftCode` (Phase 18 §1: `DS`→`D`, `NS`→`N`). Not
 * part of `ReportLabelSet` since it is language-neutral, not localized —
 * both languages show the same short code. `ShiftCode` is an open,
 * unbranded-enum domain type (BR-SHIFT-002 permits other values, e.g. the
 * legacy `D`/`N` shorthand some fixtures still use directly), so any
 * value outside `DS`/`NS` passes through unchanged rather than being
 * rejected.
 */
export function shiftCodeDisplayLabel(shiftCode: ShiftCode): string {
  const value = shiftCode as string
  if (value === 'DS') return 'D'
  if (value === 'NS') return 'N'
  return value
}

/**
 * Combined Batch/Rit report display, e.g. `024/011` (Phase 18 §11,
 * BUSINESS_RULES.md §17: the domain model keeps `batchNumber`/`ritNumber`
 * fully separate — this combined form is presentation-only, for Haulage
 * Detail's Batch column specifically, and must never be parsed back or
 * stored as a single value.
 */
export function formatBatchRit(batchNumber: number, ritNumber: number): string {
  return `${String(batchNumber).padStart(3, '0')}/${String(ritNumber).padStart(3, '0')}`
}

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `YYYY-MM-DD` → `DD-MMM-YY` (Phase 18 §1, e.g. `08-Jul-26`) — the fixed
 * report's date format. Language-neutral like the rest of this literal
 * contract (month abbreviations stay in English regardless of report
 * language, matching the fixed contract's own example).
 */
export function formatReportDate(shiftDate: string): string {
  const [year, month, day] = shiftDate.split('-').map(Number)
  const twoDigitYear = String(year % 100).padStart(2, '0')
  return `${String(day).padStart(2, '0')}-${MONTH_ABBREVIATIONS[month - 1]}-${twoDigitYear}`
}

/**
 * Report-language label sets (ROADMAP Phase 14 §10). Deliberately
 * standalone data, not wired to i18next/react-i18next — the report
 * language is explicit application input and stays fully independent of
 * the app's own UI language. Only display labels/statuses live here;
 * ShiftId/PileId/OreCode/TruckId/Batch/Rit are never localized (§10) and
 * so never appear in this module. `sampleStatus`/`truckStatus`/
 * `wrongTruckReason` map the internal domain codes (`REQUIRED`,
 * `VALID`/`WRONG_TRUCK`, `WrongTruckReasonCode`) to display text only —
 * the stored codes themselves are never renamed or replaced, only
 * presented differently per language (bilingual cleanup).
 */
const LABELS: Record<ReportLanguage, ReportLabelSet> = {
  id: {
    // BR-REPORT-001: semantically equivalent to the EN title below — not a generic "Laporan Shift".
    title: 'LAPORAN HARIAN JAMINAN KUALITAS BIJIH',
    sections: {
      header: 'Kepala Laporan',
      manpower: 'Tenaga Kerja',
      productionSummary: 'Ringkasan Produksi',
      productionTotals: 'Total Produksi',
      sampleHandling: 'Penanganan Sampel',
      wrongTruck: 'Truk Salah',
      pendingSamples: 'Sampel Tertunda',
      haulageDetail: 'Detail Pengangkutan',
    },
    columns: {
      date: 'Tanggal',
      shift: 'Shift',
      isoWeek: 'Minggu ISO',
      location: 'Lokasi',
      jobDesk: 'Job Desk',
      employeeId: 'NIK',
      employeeName: 'Nama',
      pileId: 'Pile_ID',
      ore: 'Ore',
      stockpile: 'Stockpile',
      rit: 'Rit',
      batch: 'Batch',
      increment: 'Increment',
      wrongTruck: 'Truk Salah',
      status: 'Status',
      destination: 'Tujuan',
      dispatcherEmployeeId: 'NIK Pengirim',
      dispatcherName: 'Nama Pengirim',
      incrementFrom: 'Increment Dari',
      incrementTo: 'Increment Sampai',
      totalBag: 'Total Karung',
      transactionId: 'Transaction_ID',
      frontId: 'Front_ID',
      truckId: 'Truck_ID',
      fleetId: 'Fleet_ID',
      reasons: 'Alasan',
      sampleStatus: 'Status Sampel',
      truckStatus: 'Status Truk',
      pendingRitNumbers: 'Rit Tertunda',
    },
    deliveryStatus: {
      NOT_PICKED_UP: 'Belum Diambil',
      DELIVERED: 'Terkirim',
    },
    sampleStatus: {
      REQUIRED: 'Wajib Sampel',
      NOT_REQUIRED: 'Tidak Wajib Sampel',
    },
    truckStatus: {
      VALID: 'Valid',
      WRONG_TRUCK: 'Truk Salah',
    },
    wrongTruckReason: {
      NOT_IN_EFFECTIVE_FLEET: 'Tidak Termasuk Armada Efektif',
      HAULER_MISMATCH: 'Hauler Tidak Sesuai',
    },
  },
  en: {
    // BR-REPORT-001: the exact required title text — must not drift from this literal.
    title: 'DAILY ORE QUALITY ASSURANCE REPORT',
    sections: {
      header: 'Header',
      manpower: 'Manpower',
      productionSummary: 'Production Summary',
      productionTotals: 'Production Totals',
      sampleHandling: 'Sample Handling',
      wrongTruck: 'Wrong Truck',
      pendingSamples: 'Pending Samples',
      haulageDetail: 'Haulage Detail',
    },
    columns: {
      date: 'Date',
      shift: 'Shift',
      isoWeek: 'ISO Week',
      location: 'Location',
      jobDesk: 'Job Desk',
      employeeId: 'NIK / Employee ID',
      employeeName: 'Name',
      pileId: 'Pile_ID',
      ore: 'Ore',
      stockpile: 'Stockpile',
      rit: 'Rit',
      batch: 'Batch',
      increment: 'Increment',
      wrongTruck: 'Wrong Truck',
      status: 'Status',
      destination: 'Destination',
      dispatcherEmployeeId: 'Dispatcher Employee ID',
      dispatcherName: 'Dispatcher Name',
      incrementFrom: 'Increment From',
      incrementTo: 'Increment To',
      totalBag: 'Total Bag',
      transactionId: 'Transaction_ID',
      frontId: 'Front_ID',
      truckId: 'Truck_ID',
      fleetId: 'Fleet_ID',
      reasons: 'Reasons',
      sampleStatus: 'Sample Status',
      truckStatus: 'Truck Status',
      pendingRitNumbers: 'Pending Rit',
    },
    deliveryStatus: {
      NOT_PICKED_UP: 'Not Picked Up',
      DELIVERED: 'Delivered',
    },
    sampleStatus: {
      REQUIRED: 'Required',
      NOT_REQUIRED: 'Not Required',
    },
    truckStatus: {
      VALID: 'Valid',
      WRONG_TRUCK: 'Wrong Truck',
    },
    wrongTruckReason: {
      NOT_IN_EFFECTIVE_FLEET: 'Not In Effective Fleet',
      HAULER_MISMATCH: 'Hauler Mismatch',
    },
  },
}

export function getReportLabels(language: ReportLanguage): ReportLabelSet {
  return LABELS[language]
}
