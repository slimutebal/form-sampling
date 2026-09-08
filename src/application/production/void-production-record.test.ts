import { describe, expect, it } from 'vitest'
import { voidProductionRecord } from '@/application/production/void-production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixtureEmployeeId,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')
const correctedBy = fixtureEmployeeId('12345')
const correctedAt = new Date('2026-09-08T02:00:00.000Z')

function buildRecord() {
  const transaction = buildFixtureHaulageTransaction({
    id: 'TX-1',
    shiftId: 'SHIFT-1',
    pile,
    batch: 1,
    rit: 1,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction })
}

describe('voidProductionRecord', () => {
  it('sets status ACTIVE -> VOIDED', () => {
    const record = buildRecord()
    const result = voidProductionRecord({ record, reason: 'Salah catat', correctedAt, correctedBy })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.effective.status).toBe('VOIDED')
  })

  it('retains the original transaction', () => {
    const record = buildRecord()
    const result = voidProductionRecord({ record, reason: 'Salah catat', correctedAt, correctedBy })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transaction).toBe(record.transaction)
  })

  it('appends a VOID_RECORD correction', () => {
    const record = buildRecord()
    const result = voidProductionRecord({
      record,
      reason: 'Salah catat',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.audit.corrections).toHaveLength(1)
    expect(result.value.audit.corrections[0]!.type).toBe('VOID_RECORD')
    expect(result.value.audit.corrections[0]!.id).toBe('CORR-1')
  })

  it('requires a non-blank reason', () => {
    const record = buildRecord()
    const result = voidProductionRecord({ record, reason: '   ', correctedAt, correctedBy })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REASON_REQUIRED')
  })

  it('rejects voiding an already-VOIDED record', () => {
    const record = buildRecord()
    const first = voidProductionRecord({ record, reason: 'first', correctedAt, correctedBy })
    if (!first.ok) throw new Error('setup failed')
    const second = voidProductionRecord({ record: first.value, reason: 'again', correctedAt, correctedBy })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('ALREADY_VOIDED')
  })
})
