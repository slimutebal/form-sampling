import { describe, expect, it } from 'vitest'
import { parseDeliveryDestinationCode } from '@/domain/sample-handling/delivery-destination'
import { createDeliveredDelivery, createNotPickedUpDelivery } from '@/domain/sample-handling/delivery-status'
import {
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_EMPLOYEE_NAME,
  FIXTURE_WRONG_TRUCK_TRUCK_ID,
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureSamplePosition,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureEmployeeId,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import { buildShiftReport, type BuildShiftReportInput } from './build-shift-report'
import { formatWhatsAppReport } from './format-whatsapp-report'
import type { ShiftReport } from './report-types'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const destination = parseDeliveryDestinationCode('LAB-1')
if (!destination.ok) throw new Error('bad fixture')

function baseInput(overrides: Partial<BuildShiftReportInput> = {}): BuildShiftReportInput {
  const pile = buildFixtureSapPile('PILE-1')
  return {
    language: 'en',
    shift: buildFixtureShift('SHIFT-1'),
    piles: [pile],
    haulageTransactions: [],
    samplePositions: [],
    masterData,
    manpowerAssignments: [],
    ...overrides,
  }
}

function buildReport(overrides: Partial<BuildShiftReportInput> = {}): ShiftReport {
  const result = buildShiftReport(baseInput(overrides))
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

describe('formatWhatsAppReport — header', () => {
  it('EN title is the exact Phase 14 literal, bolded', () => {
    const report = buildReport({ language: 'en' })
    const text = formatWhatsAppReport(report)
    expect(text).toContain('*DAILY ORE QUALITY ASSURANCE REPORT*')
  })

  it('ID title is the exact Phase 14 literal, bolded', () => {
    const report = buildReport({ language: 'id' })
    const text = formatWhatsAppReport(report)
    expect(text).toContain('*LAPORAN HARIAN JAMINAN KUALITAS BIJIH*')
  })

  it('includes the fixed contract greeting, subtitle, combined Date/Shift and Week lines (Phase 18 §1)', () => {
    const report = buildReport({ language: 'en' })
    const text = formatWhatsAppReport(report)
    expect(text).toContain('Dear All,')
    expect(text).toContain('-- Ore & Sample Production --')
    expect(text).toContain('Date/Shift: 04-Sep-26 / D')
    expect(text).toContain('Week: 36')
  })

  it.each([
    ['DS', 'D'],
    ['NS', 'N'],
  ] as const)('maps internal shift code %s to report display %s (Phase 18 §1)', (shiftCode, expectedLabel) => {
    const shift = { ...buildFixtureShift('SHIFT-1'), shiftCode } as BuildShiftReportInput['shift']
    const report = buildReport({ shift })
    const text = formatWhatsAppReport(report)
    expect(text).toContain(`Date/Shift: 04-Sep-26 / ${expectedLabel}`)
  })
})

describe('formatWhatsAppReport — manpower', () => {
  it('renders Job Desk, Employee ID and Name for each row', () => {
    const report = buildReport({
      manpowerAssignments: [{ personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' }],
    })
    const text = formatWhatsAppReport(report)
    expect(text).toContain(`Job Desk: FOREMAN`)
    expect(text).toContain(`NIK / Employee ID: ${FIXTURE_EMPLOYEE_ID}`)
    expect(text).toContain(`Name: ${FIXTURE_EMPLOYEE_NAME}`)
  })

  it('empty manpower renders an explicit localized empty state, not a blank section', () => {
    const report = buildReport({ manpowerAssignments: [] })
    const text = formatWhatsAppReport(report)
    expect(text).toContain('No manpower assigned.')
  })

  it('EN manpower report contains Location exactly once', () => {
    const report = buildReport({
      manpowerAssignments: [{ personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' }],
    })
    const text = formatWhatsAppReport(report)
    expect(text).toContain(`Location: ${report.manpower[0].location}`)
    expect(text.split('Location:').length - 1).toBe(1)
  })

  it('ID manpower report contains localized Location label exactly once', () => {
    const report = buildReport({
      language: 'id',
      manpowerAssignments: [{ personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' }],
    })
    const text = formatWhatsAppReport(report)
    expect(text).toContain(`Lokasi: ${report.manpower[0].location}`)
    expect(text.split('Lokasi:').length - 1).toBe(1)
  })

  it('multiple manpower rows do not duplicate Location', () => {
    const report = buildReport({
      manpowerAssignments: [
        { personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' },
        { personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'SAMPLER' },
      ],
    })
    const text = formatWhatsAppReport(report)
    expect(text.split('Location:').length - 1).toBe(1)
  })
})

describe('formatWhatsAppReport — production', () => {
  it('multiple piles each get a row, and totals reflect Phase 14 values exactly', () => {
    const sapPile = buildFixtureSapPile('PILE-SAP')
    const limPile = buildFixtureLimPile('PILE-LIM')
    const report = buildReport({
      piles: [sapPile, limPile],
      haulageTransactions: [
        buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile: sapPile, batch: 1, rit: 2, masterData, fleetSetup }),
        buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile: limPile, batch: 1, rit: 5, masterData, fleetSetup }),
      ],
    })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Pile_ID: PILE-SAP')
    expect(text).toContain('Pile_ID: PILE-LIM')
    expect(text).toContain(
      `Rit: ${report.productionTotals.rit} | Batch: ${report.productionTotals.batch} | Increment: ${report.productionTotals.increment} | Wrong Truck: ${report.productionTotals.wrongTruck}`,
    )
  })
})

describe('formatWhatsAppReport — sample handling', () => {
  it('delivered: includes destination and dispatcher when present', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createDeliveredDelivery(destination.value, fixtureEmployeeId(FIXTURE_EMPLOYEE_ID)),
    })
    const report = buildReport({ piles: [pile], samplePositions: [position] })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Status: Delivered')
    expect(text).toContain('Destination: LAB-1')
    expect(text).toContain(`Dispatcher Employee ID: ${FIXTURE_EMPLOYEE_ID}`)
    expect(text).toContain(`Dispatcher Name: ${FIXTURE_EMPLOYEE_NAME}`)
  })

  it('not picked up: no destination/dispatcher fields, and no literal "undefined"/"null"', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const report = buildReport({ piles: [pile], samplePositions: [position] })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Status: Not Picked Up')
    expect(text).not.toContain('Destination:')
    expect(text).not.toContain('Dispatcher')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })

  it('destination/dispatcher are independently optional: destination present without a dispatcher', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 4,
      masterData,
      delivery: createDeliveredDelivery(destination.value),
    })
    const report = buildReport({ piles: [pile], samplePositions: [position] })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Destination: LAB-1')
    expect(text).not.toContain('Dispatcher')
  })

  it('preserves a fractional 0.5 Total Bag without rounding', () => {
    const limPile = buildFixtureLimPile('PILE-LIM')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 5,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const report = buildReport({ piles: [limPile], samplePositions: [position] })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Total Bag: 0.5')
  })
})

describe('formatWhatsAppReport — haulage detail (Phase 18 §1/§11)', () => {
  it('includes every haulage transaction, wrong-truck rows included with their Remark', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const report = buildReport({
      piles: [pile],
      haulageTransactions: [
        buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
        buildFixtureHaulageTransaction({
          id: 'T-2',
          shiftId: 'SHIFT-1',
          pile,
          batch: 1,
          rit: 2,
          masterData,
          fleetSetup,
          truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
        }),
      ],
    })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('*Haulage Detail*')
    expect(text).toContain('Transaction_ID: T-1')
    expect(text).toContain('Transaction_ID: T-2')
    expect(text).toContain('Reasons: Not In Effective Fleet')
  })

  it('never renders "undefined" for a Pile with no resolvable Stockpile', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const report = buildReport({
      piles: [pile],
      haulageTransactions: [buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup })],
    })
    const text = formatWhatsAppReport(report)

    expect(text).not.toContain('undefined')
  })
})

describe('formatWhatsAppReport — wrong truck', () => {
  it('renders localized reason labels, never the raw reason code', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const report = buildReport({
      piles: [pile],
      haulageTransactions: [
        buildFixtureHaulageTransaction({
          id: 'T-1',
          shiftId: 'SHIFT-1',
          pile,
          batch: 1,
          rit: 1,
          masterData,
          fleetSetup,
          truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
        }),
      ],
    })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Reasons: Not In Effective Fleet')
    expect(text).not.toContain('NOT_IN_EFFECTIVE_FLEET')
    expect(text).not.toContain('HAULER_MISMATCH')
    expect(text).not.toContain('WRONG_TRUCK')
  })

  it('no wrong truck renders an explicit localized empty state', () => {
    const report = buildReport()
    const text = formatWhatsAppReport(report)
    expect(text).toContain('No wrong truck entries.')
  })
})

describe('formatWhatsAppReport — pending samples', () => {
  it('renders Pile, Ore, Batch and pending Rit numbers', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const report = buildReport({
      piles: [pile],
      haulageTransactions: [buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })],
    })
    const text = formatWhatsAppReport(report)

    expect(text).toContain('Pile_ID: PILE-1')
    expect(text).toContain('Pending Rit: 2')
  })

  it('no pending samples renders an explicit localized empty state', () => {
    const report = buildReport()
    const text = formatWhatsAppReport(report)
    expect(text).toContain('No pending samples.')
  })
})

describe('formatWhatsAppReport — determinism, immutability, no dummy text', () => {
  it('is deterministic for the same report', () => {
    const report = buildReport({
      manpowerAssignments: [{ personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' }],
    })
    expect(formatWhatsAppReport(report)).toBe(formatWhatsAppReport(report))
  })

  it('never mutates the underlying ShiftReport', () => {
    const report = buildReport({
      manpowerAssignments: [{ personId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), name: FIXTURE_EMPLOYEE_NAME, jobDeskCode: 'FOREMAN' }],
    })
    const before = structuredClone(report)
    formatWhatsAppReport(report)
    expect(report).toEqual(before)
  })

  it('never renders the literal "undefined" or "null" anywhere, even with every optional field absent', () => {
    const report = buildReport()
    const text = formatWhatsAppReport(report)
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })

  it('id and en formatted text differ in labels but agree on every business number/id', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const transactions = [
      buildFixtureHaulageTransaction({
        id: 'T-1',
        shiftId: 'SHIFT-1',
        pile,
        batch: 1,
        rit: 2,
        masterData,
        fleetSetup,
        truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
      }),
    ]
    const en = buildReport({ language: 'en', piles: [pile], haulageTransactions: transactions })
    const id = buildReport({ language: 'id', piles: [pile], haulageTransactions: transactions })
    const enText = formatWhatsAppReport(en)
    const idText = formatWhatsAppReport(id)

    expect(enText).not.toBe(idText)
    expect(enText).toContain('T-1')
    expect(idText).toContain('T-1')
    expect(enText).toContain('PILE-1')
    expect(idText).toContain('PILE-1')
    expect(enText).toContain(`Rit: ${en.productionTotals.rit}`)
    expect(idText).toContain(`Rit: ${id.productionTotals.rit}`)
  })
})
