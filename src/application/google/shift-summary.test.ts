import { describe, expect, it } from 'vitest'
import { buildShiftReport } from '@/application/reporting/build-shift-report'
import {
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { buildShiftSummary } from './shift-summary'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)

function buildReport(language: 'en' | 'id') {
  const shift = buildFixtureShift('SHIFT-1')
  const pile = buildFixtureSapPile('PILE-1')
  const result = buildShiftReport({
    language,
    shift,
    piles: [pile],
    productionRecords: [
      buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 4, masterData, fleetSetup }),
      buildFixtureHaulageTransaction({
        id: 'T-3',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 6,
        masterData,
        fleetSetup,
        truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
      }),
    ].map((transaction) => buildFixtureProductionRecord({ transaction })),
    samplePositions: [],
    masterData,
    manpowerAssignments: [],
  })
  if (!result.ok) throw new Error('invalid test fixture')
  return { shift, report: result.value }
}

describe('buildShiftSummary', () => {
  it('maps Shift identity fields and Phase 14 productionTotals verbatim', () => {
    const { shift, report } = buildReport('en')
    const result = buildShiftSummary(shift, report)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      shiftId: 'SHIFT-1',
      date: '2026-09-04',
      shiftCode: 'D',
      sectorCode: 'S1',
      samplingHouseCode: 'HOUSE-1',
      ritTotal: 3,
      batchTotal: 1,
      incrementTotal: 3,
      wrongTruckTotal: 1,
    })
  })

  it('produces an identical machine summary for an "id" report and an "en" report of the same shift', () => {
    const en = buildReport('en')
    const id = buildReport('id')

    const enSummary = buildShiftSummary(en.shift, en.report)
    const idSummary = buildShiftSummary(id.shift, id.report)

    expect(enSummary.ok).toBe(true)
    expect(idSummary.ok).toBe(true)
    if (!enSummary.ok || !idSummary.ok) return
    expect(idSummary.value).toEqual(enSummary.value)
  })

  it('rejects a report whose header Date does not match the Shift Date', () => {
    const { shift, report } = buildReport('en')
    const mismatched = { ...report, header: { ...report.header, date: '2026-09-05' as typeof report.header.date } }
    const result = buildShiftSummary(shift, mismatched)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_SUMMARY_DATE_MISMATCH')
  })

  it('rejects a report whose header ShiftCode does not match the Shift ShiftCode', () => {
    const { shift, report } = buildReport('en')
    const mismatched = { ...report, header: { ...report.header, shiftCode: 'N' as typeof report.header.shiftCode } }
    const result = buildShiftSummary(shift, mismatched)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_SUMMARY_SHIFT_CODE_MISMATCH')
  })

  it('never recalculates totals — a report with tampered productionTotals is passed through unchanged', () => {
    const { shift, report } = buildReport('en')
    const tampered = { ...report, productionTotals: { rit: 999, batch: 999, increment: 999, wrongTruck: 999 } }
    const result = buildShiftSummary(shift, tampered)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.ritTotal).toBe(999)
    expect(result.value.batchTotal).toBe(999)
  })
})
