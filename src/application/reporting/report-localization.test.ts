import { describe, expect, it } from 'vitest'
import { getReportLabels } from './report-localization'

describe('getReportLabels', () => {
  it('id and en produce different display text', () => {
    const id = getReportLabels('id')
    const en = getReportLabels('en')
    expect(id.title).not.toBe(en.title)
    expect(id.sections.productionSummary).not.toBe(en.sections.productionSummary)
    expect(id.deliveryStatus.NOT_PICKED_UP).not.toBe(en.deliveryStatus.NOT_PICKED_UP)
    expect(id.deliveryStatus.DELIVERED).not.toBe(en.deliveryStatus.DELIVERED)
  })

  it('id and en produce different sample-status display text', () => {
    const id = getReportLabels('id')
    const en = getReportLabels('en')
    expect(id.sampleStatus.REQUIRED).not.toBe(en.sampleStatus.REQUIRED)
    expect(id.sampleStatus.NOT_REQUIRED).not.toBe(en.sampleStatus.NOT_REQUIRED)
  })

  it('id and en produce different truck-status display text', () => {
    const id = getReportLabels('id')
    const en = getReportLabels('en')
    expect(id.truckStatus.WRONG_TRUCK).not.toBe(en.truckStatus.WRONG_TRUCK)
    // VALID happens to read the same in both languages — still asserted explicitly, not skipped.
    expect(id.truckStatus.VALID).toBe('Valid')
    expect(en.truckStatus.VALID).toBe('Valid')
  })

  it('id and en localize every WrongTruckReasonCode', () => {
    const id = getReportLabels('id')
    const en = getReportLabels('en')
    expect(id.wrongTruckReason.NOT_IN_EFFECTIVE_FLEET).not.toBe(en.wrongTruckReason.NOT_IN_EFFECTIVE_FLEET)
    expect(id.wrongTruckReason.HAULER_MISMATCH).not.toBe(en.wrongTruckReason.HAULER_MISMATCH)
    expect(en.wrongTruckReason.NOT_IN_EFFECTIVE_FLEET).not.toBe('NOT_IN_EFFECTIVE_FLEET')
    expect(en.wrongTruckReason.HAULER_MISMATCH).not.toBe('HAULER_MISMATCH')
  })

  it('en labels are stable, human-readable strings', () => {
    const en = getReportLabels('en')
    expect(en.sections.wrongTruck).toBe('Wrong Truck')
    expect(en.deliveryStatus.NOT_PICKED_UP).toBe('Not Picked Up')
    expect(en.deliveryStatus.DELIVERED).toBe('Delivered')
  })

  it('BR-REPORT-001: EN title is exactly "DAILY ORE QUALITY ASSURANCE REPORT"', () => {
    expect(getReportLabels('en').title).toBe('DAILY ORE QUALITY ASSURANCE REPORT')
  })

  it('BR-REPORT-001: ID title is a semantically equivalent Indonesian title, not a generic "Laporan Shift"', () => {
    const idTitle = getReportLabels('id').title
    expect(idTitle).not.toBe('Laporan Shift')
    // Semantically equivalent to "Daily Ore Quality Assurance Report": every concept must be present.
    expect(idTitle).toMatch(/laporan/i)
    expect(idTitle).toMatch(/harian/i)
    expect(idTitle).toMatch(/kualitas/i)
    expect(idTitle).toMatch(/bijih/i)
  })

  it('id and en cover the same set of section keys', () => {
    const id = getReportLabels('id')
    const en = getReportLabels('en')
    expect(Object.keys(id.sections).sort()).toEqual(Object.keys(en.sections).sort())
    expect(Object.keys(id.columns).sort()).toEqual(Object.keys(en.columns).sort())
    expect(Object.keys(id.sampleStatus).sort()).toEqual(Object.keys(en.sampleStatus).sort())
    expect(Object.keys(id.truckStatus).sort()).toEqual(Object.keys(en.truckStatus).sort())
    expect(Object.keys(id.wrongTruckReason).sort()).toEqual(Object.keys(en.wrongTruckReason).sort())
  })
})
