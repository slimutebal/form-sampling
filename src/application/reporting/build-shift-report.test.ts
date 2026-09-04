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

describe('buildShiftReport — header', () => {
  it('takes Date, Shift and ISO week from the Shift', () => {
    const result = buildShiftReport(baseInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.header.date).toBe('2026-09-04')
    expect(result.value.header.shiftCode).toBe('D')
    expect(result.value.header.isoWeek).toEqual({ isoYear: 2026, isoWeekNumber: 36 })
  })
})

describe('buildShiftReport — production summary/totals', () => {
  it('single pile: Rit/Batch/Increment/Wrong Truck', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [
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
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([
      { pileId: 'PILE-1', oreCode: 'SAP', rit: 3, batch: 1, increment: 3, wrongTruck: 1 },
    ])
    expect(result.value.productionTotals).toEqual({ rit: 3, batch: 1, increment: 3, wrongTruck: 1 })
  })

  it('SAP and LIM piles both produce rows, Ore comes from the workspace Pile', () => {
    const sapPile = buildFixtureSapPile('PILE-SAP')
    const limPile = buildFixtureLimPile('PILE-LIM')
    const result = buildShiftReport(
      baseInput({
        piles: [sapPile, limPile],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile: sapPile, batch: 1, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile: limPile, batch: 1, rit: 5, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([
      { pileId: 'PILE-SAP', oreCode: 'SAP', rit: 1, batch: 1, increment: 1, wrongTruck: 0 },
      { pileId: 'PILE-LIM', oreCode: 'LIM', rit: 1, batch: 1, increment: 1, wrongTruck: 0 },
    ])
  })

  it('distinct Batch is counted per Pile, not per transaction', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-3', shiftId: 'SHIFT-1', pile, batch: 2, rit: 1, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.rit).toBe(3)
    expect(result.value.productionSummary[0]?.batch).toBe(2)
  })

  it('the same Batch number on different Piles counts separately in the total (never one global Set)', () => {
    const pileA = buildFixtureSapPile('PILE-A')
    const pileB = buildFixtureSapPile('PILE-B')
    const result = buildShiftReport(
      baseInput({
        piles: [pileA, pileB],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-A', shiftId: 'SHIFT-1', pile: pileA, batch: 1, rit: 1, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-B', shiftId: 'SHIFT-1', pile: pileB, batch: 1, rit: 1, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary.map((row) => row.batch)).toEqual([1, 1])
    expect(result.value.productionTotals.batch).toBe(2)
  })

  it('Increment counts stored sampleRequired === true, never re-evaluated', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 1, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.increment).toBe(1)
  })

  it('Wrong Truck counts stored truckValidation.status === WRONG_TRUCK, never re-validated', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
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
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary[0]?.wrongTruck).toBe(1)
  })

  it('totals equal the sum of the production summary rows', () => {
    const pileA = buildFixtureSapPile('PILE-A')
    const pileB = buildFixtureLimPile('PILE-B')
    const result = buildShiftReport(
      baseInput({
        piles: [pileA, pileB],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile: pileA, batch: 1, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile: pileA, batch: 2, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-3', shiftId: 'SHIFT-1', pile: pileB, batch: 1, rit: 5, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { productionSummary, productionTotals } = result.value
    expect(productionTotals).toEqual({
      rit: productionSummary.reduce((sum, row) => sum + row.rit, 0),
      batch: productionSummary.reduce((sum, row) => sum + row.batch, 0),
      increment: productionSummary.reduce((sum, row) => sum + row.increment, 0),
      wrongTruck: productionSummary.reduce((sum, row) => sum + row.wrongTruck, 0),
    })
  })

  it('empty production: no rows, zero totals; a Pile with no transactions gets no row', () => {
    const result = buildShiftReport(baseInput({ piles: [buildFixtureSapPile('PILE-1')], haulageTransactions: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.productionSummary).toEqual([])
    expect(result.value.productionTotals).toEqual({ rit: 0, batch: 0, increment: 0, wrongTruck: 0 })
  })
})

describe('buildShiftReport — sample handling', () => {
  it('DELIVERED position: status, destination and localized label', () => {
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
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position], language: 'en' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.status).toBe('DELIVERED')
    expect(row?.statusLabel).toBe('Delivered')
    expect(row?.destination).toBe('LAB-1')
  })

  it('NOT_PICKED_UP position: status, no destination, localized label', () => {
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
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position], language: 'en' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.status).toBe('NOT_PICKED_UP')
    expect(row?.statusLabel).toBe('Not Picked Up')
    expect(row?.destination).toBeUndefined()
  })

  it('dispatcher present: preserved and resolved from MasterData', () => {
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
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.dispatcherEmployeeId).toBe(FIXTURE_EMPLOYEE_ID)
    expect(row?.dispatcherName).toBe(FIXTURE_EMPLOYEE_NAME)
  })

  it('dispatcher absent: DELIVERED without a dispatcher stays valid, no dispatcher fields', () => {
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
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(row?.dispatcherEmployeeId).toBeUndefined()
    expect(row?.dispatcherName).toBeUndefined()
  })

  it('SAP range: Increment From/To come from stored sampledRitNumbers', () => {
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
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(Number(row?.incrementFrom)).toBe(2)
    expect(Number(row?.incrementTo)).toBe(4)
    expect(Number(row?.totalBag)).toBe(2)
  })

  it('LIM range with fractional Total Bag (0.5), preserved without rounding', () => {
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
    const result = buildShiftReport(baseInput({ piles: [limPile], samplePositions: [position] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.sampleHandling[0]
    expect(Number(row?.incrementFrom)).toBe(5)
    expect(Number(row?.incrementTo)).toBe(5)
    expect(Number(row?.totalBag)).toBe(0.5)
  })
})

describe('buildShiftReport — manpower', () => {
  it('resolves the employee and copies the Name from MasterData', () => {
    const result = buildShiftReport(
      baseInput({
        manpowerAssignments: [{ employeeId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), jobDeskCode: 'FOREMAN' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.manpower).toEqual([
      {
        date: '2026-09-04',
        shiftCode: 'D',
        location: 'HOUSE-1',
        jobDeskCode: 'FOREMAN',
        employeeId: FIXTURE_EMPLOYEE_ID,
        employeeName: FIXTURE_EMPLOYEE_NAME,
      },
    ])
  })

  it('rejects an unknown EmployeeId', () => {
    const result = buildShiftReport(
      baseInput({
        manpowerAssignments: [{ employeeId: fixtureEmployeeId('99999'), jobDeskCode: 'FOREMAN' }],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_MANPOWER_EMPLOYEE_NOT_FOUND')
  })

  it('empty manpower is allowed', () => {
    const result = buildShiftReport(baseInput({ manpowerAssignments: [] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.manpower).toEqual([])
  })
})

describe('buildShiftReport — pending samples', () => {
  it('an unhandled sampled Rit appears as pending', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([{ pileId: 'PILE-1', oreCode: 'SAP', batchNumber: 1, pendingRitNumbers: [2] }])
  })

  it('a handled sample does not reappear', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const handled = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile,
      batch: 1,
      ritFrom: 2,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })],
        samplePositions: [handled],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([])
  })

  it('duplicate physical haulage position does not multiply the pending count', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        piles: [pile],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({ id: 'T-2', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pendingSamples).toEqual([{ pileId: 'PILE-1', oreCode: 'SAP', batchNumber: 1, pendingRitNumbers: [2] }])
  })
})

describe('buildShiftReport — wrong truck and haulage detail', () => {
  it('wrong truck rows carry Transaction_ID, Pile, Batch, Rit, Front, Truck and reasons', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
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
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.wrongTruck).toEqual([
      {
        transactionId: 'T-1',
        pileId: 'PILE-1',
        batchNumber: 1,
        ritNumber: 1,
        frontId: 'F1',
        truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
        reasons: ['NOT_IN_EFFECTIVE_FLEET'],
        reasonLabels: ['Not In Effective Fleet'],
      },
    ])
  })

  it('haulage detail keeps Batch and Rit as separate numeric fields, not a combined string, and carries localized status labels', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        language: 'en',
        piles: [pile],
        haulageTransactions: [
          buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup }),
          buildFixtureHaulageTransaction({
            id: 'T-2',
            shiftId: 'SHIFT-1',
            pile,
            batch: 1,
            rit: 4,
            masterData,
            fleetSetup,
            truckId: FIXTURE_WRONG_TRUCK_TRUCK_ID,
          }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [validRow, wrongTruckRow] = result.value.haulageDetail
    expect(validRow?.batchNumber).toBe(1)
    expect(validRow?.ritNumber).toBe(2)
    expect(validRow?.sampleStatus).toBe('REQUIRED')
    expect(validRow?.sampleStatusLabel).toBe('Required')
    expect(validRow?.truckStatus).toBe('VALID')
    expect(validRow?.truckStatusLabel).toBe('Valid')
    expect(validRow?.oreCode).toBe('SAP')
    expect(validRow?.wrongTruckReasons).toEqual([])
    expect(validRow?.wrongTruckReasonLabels).toEqual([])

    expect(wrongTruckRow?.truckStatus).toBe('WRONG_TRUCK')
    expect(wrongTruckRow?.truckStatusLabel).toBe('Wrong Truck')
    expect(wrongTruckRow?.wrongTruckReasons).toEqual(['NOT_IN_EFFECTIVE_FLEET'])
    expect(wrongTruckRow?.wrongTruckReasonLabels).toEqual(['Not In Effective Fleet'])
  })

  it('never displays a raw sample-status/truck-status/reason code as its own label', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const result = buildShiftReport(
      baseInput({
        language: 'id',
        piles: [pile],
        haulageTransactions: [
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
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.value.haulageDetail[0]
    expect(row?.sampleStatusLabel).not.toBe(row?.sampleStatus)
    expect(row?.truckStatusLabel).not.toBe(row?.truckStatus)
    expect(row?.wrongTruckReasonLabels[0]).not.toBe(row?.wrongTruckReasons[0])
  })
})

describe('buildShiftReport — language', () => {
  it('id and en differ in labels but agree on every number/id', () => {
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
    const en = buildShiftReport(baseInput({ language: 'en', piles: [pile], haulageTransactions: transactions }))
    const id = buildShiftReport(baseInput({ language: 'id', piles: [pile], haulageTransactions: transactions }))
    expect(en.ok).toBe(true)
    expect(id.ok).toBe(true)
    if (!en.ok || !id.ok) return

    expect(en.value.header.title).not.toBe(id.value.header.title)
    // BR-REPORT-001: EN title is the exact required literal; ID is a real translation, not a generic fallback.
    expect(en.value.header.title).toBe('DAILY ORE QUALITY ASSURANCE REPORT')
    expect(id.value.header.title).not.toBe('Laporan Shift')
    expect(en.value.header.date).toBe(id.value.header.date)
    expect(en.value.header.isoWeek).toEqual(id.value.header.isoWeek)
    expect(en.value.productionSummary).toEqual(id.value.productionSummary)
    expect(en.value.productionTotals).toEqual(id.value.productionTotals)

    // Sample-status / truck-status / wrong-truck-reason labels differ...
    expect(en.value.haulageDetail[0]?.sampleStatusLabel).not.toBe(id.value.haulageDetail[0]?.sampleStatusLabel)
    expect(en.value.haulageDetail[0]?.truckStatusLabel).not.toBe(id.value.haulageDetail[0]?.truckStatusLabel)
    expect(en.value.haulageDetail[0]?.wrongTruckReasonLabels).not.toEqual(id.value.haulageDetail[0]?.wrongTruckReasonLabels)
    expect(en.value.wrongTruck[0]?.reasonLabels).not.toEqual(id.value.wrongTruck[0]?.reasonLabels)

    // ...but every raw code/id/count stays identical.
    expect(en.value.haulageDetail[0]?.sampleStatus).toBe(id.value.haulageDetail[0]?.sampleStatus)
    expect(en.value.haulageDetail[0]?.truckStatus).toBe(id.value.haulageDetail[0]?.truckStatus)
    expect(en.value.haulageDetail[0]?.wrongTruckReasons).toEqual(id.value.haulageDetail[0]?.wrongTruckReasons)
    expect(en.value.haulageDetail[0]?.batchNumber).toBe(id.value.haulageDetail[0]?.batchNumber)
    expect(en.value.haulageDetail[0]?.ritNumber).toBe(id.value.haulageDetail[0]?.ritNumber)
    expect(en.value.wrongTruck[0]?.reasons).toEqual(id.value.wrongTruck[0]?.reasons)
    expect(en.value.wrongTruck).toHaveLength(id.value.wrongTruck.length)
  })
})

describe('buildShiftReport — data integrity', () => {
  it('rejects a duplicate PileId', () => {
    const result = buildShiftReport(
      baseInput({ piles: [buildFixtureSapPile('PILE-1'), buildFixtureSapPile('PILE-1')] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_DUPLICATE_PILE_ID')
  })

  it('rejects a HaulageTransaction ShiftId mismatch', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherShiftTransaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const result = buildShiftReport(baseInput({ piles: [pile], haulageTransactions: [otherShiftTransaction] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_HAULAGE_SHIFT_ID_MISMATCH')
  })

  it('rejects a HaulageTransaction referencing a missing Pile', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-REPORT')
    const transaction = buildFixtureHaulageTransaction({
      id: 'T-1',
      shiftId: 'SHIFT-1',
      pile: otherPile,
      batch: 1,
      rit: 2,
      masterData,
      fleetSetup,
    })
    const result = buildShiftReport(baseInput({ piles: [pile], haulageTransactions: [transaction] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_HAULAGE_PILE_NOT_FOUND')
  })

  it('rejects a SamplePosition ShiftId mismatch', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-OTHER',
      pile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_SHIFT_ID_MISMATCH')
  })

  it('rejects a SamplePosition referencing a missing Pile', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-NOT-IN-REPORT')
    const position = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: otherPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 2,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [pile], samplePositions: [position] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_PILE_NOT_FOUND')
  })

  it('rejects a SamplePosition Ore mismatch against the canonical Pile', () => {
    const sapPile = buildFixtureSapPile('PILE-1')
    const limPile = buildFixtureLimPile('PILE-1')
    const inconsistentPosition = buildFixtureSamplePosition({
      id: 'SP-1',
      shiftId: 'SHIFT-1',
      pile: limPile,
      batch: 1,
      ritFrom: 1,
      ritTo: 5,
      masterData,
      delivery: createNotPickedUpDelivery(),
    })
    const result = buildShiftReport(baseInput({ piles: [sapPile], samplePositions: [inconsistentPosition] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SAMPLE_POSITION_PILE_ORE_MISMATCH')
  })
})

describe('buildShiftReport — immutability', () => {
  it('never mutates input arrays or objects', () => {
    const pile = buildFixtureSapPile('PILE-1')
    const transaction = buildFixtureHaulageTransaction({ id: 'T-1', shiftId: 'SHIFT-1', pile, batch: 1, rit: 2, masterData, fleetSetup })
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
    const manpowerAssignments = [{ employeeId: fixtureEmployeeId(FIXTURE_EMPLOYEE_ID), jobDeskCode: 'FOREMAN' }]

    const input = baseInput({
      piles: [pile],
      haulageTransactions: [transaction],
      samplePositions: [position],
      manpowerAssignments,
    })
    const before = structuredClone({
      piles: input.piles,
      haulageTransactions: input.haulageTransactions,
      samplePositions: input.samplePositions,
      manpowerAssignments: input.manpowerAssignments,
    })

    const result = buildShiftReport(input)
    expect(result.ok).toBe(true)

    expect(input.piles).toEqual(before.piles)
    expect(input.haulageTransactions).toEqual(before.haulageTransactions)
    expect(input.samplePositions).toEqual(before.samplePositions)
    expect(input.manpowerAssignments).toEqual(before.manpowerAssignments)
  })
})
