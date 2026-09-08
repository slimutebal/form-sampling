import { describe, expect, it } from 'vitest'
import {
  applyProductionSwitchPlan,
  planProductionSwitch,
} from '@/application/production/switch-production-record'
import {
  buildFixtureFleetSetup,
  buildFixtureHaulageTransaction,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixtureProductionRecord,
  buildFixtureSapPile,
  fixtureEmployeeId,
  fixturePosition,
} from '@/test/fixtures/haulage-operation-test-fixtures'

const masterData = buildFixtureMasterData()
const fleetSetup = buildFixtureFleetSetup(masterData)
const pile = buildFixtureSapPile('PILE-1')
const correctedBy = fixtureEmployeeId('12345')
const correctedAt = new Date('2026-09-08T01:58:00.000Z')

function acceptRecord(id: string, batch: number, rit: number, forPile = pile) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile: forPile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition: 'ACCEPT' })
}

function rejectRecord(id: string, batch: number, rit: number) {
  const transaction = buildFixtureHaulageTransaction({
    id,
    shiftId: 'SHIFT-1',
    pile,
    batch,
    rit,
    masterData,
    fleetSetup,
  })
  return buildFixtureProductionRecord({ transaction, disposition: 'REJECT' })
}

describe('planProductionSwitch', () => {
  it('plans a MOVE when the target position is empty', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const result = planProductionSwitch(source, fixturePosition(4, 9), [source])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mode).toBe('MOVE')
    expect(result.value.targetRecord).toBeUndefined()
  })

  it('plans a SWAP when the target position is occupied by an ACCEPT + ACTIVE record', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const target = acceptRecord('TX-2', 4, 9)
    const result = planProductionSwitch(source, fixturePosition(4, 9), [source, target])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mode).toBe('SWAP')
    expect(result.value.targetRecord).toBe(target)
  })

  it('treats a target occupied only by a REJECT record as empty (MOVE, not SWAP)', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const rejectAtTarget = rejectRecord('TX-2', 4, 9)
    const result = planProductionSwitch(source, fixturePosition(4, 9), [source, rejectAtTarget])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mode).toBe('MOVE')
  })

  it('does not treat an occupant on a different Pile at the same Batch/Rit as a conflict', () => {
    const otherPile = buildFixtureLimPile('PILE-2')
    const source = acceptRecord('TX-1', 5, 1)
    const otherPileOccupant = acceptRecord('TX-2', 4, 9, otherPile)
    const result = planProductionSwitch(source, fixturePosition(4, 9), [source, otherPileOccupant])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mode).toBe('MOVE')
  })

  it('rejects switching a REJECT record', () => {
    const source = rejectRecord('TX-1', 5, 1)
    const result = planProductionSwitch(source, fixturePosition(4, 9), [source])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORD_NOT_SWITCHABLE')
  })

  it('rejects switching a VOIDED record', () => {
    const source = { ...acceptRecord('TX-1', 5, 1) }
    const voided = { ...source, effective: { ...source.effective, status: 'VOIDED' as const } }
    const result = planProductionSwitch(voided, fixturePosition(4, 9), [voided])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RECORD_NOT_SWITCHABLE')
  })

  it('rejects a target position equal to the source’s own current position', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const result = planProductionSwitch(source, fixturePosition(5, 1), [source])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SWITCH_TARGET_SAME_AS_SOURCE')
  })
})

describe('applyProductionSwitchPlan', () => {
  it('MOVE updates only the source, to the target position', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({
      plan: plan.value,
      reason: 'Salah posisi ritase',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.updatedSource.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(result.value.updatedSource.effective.batchPosition.ritNumber)).toBe(9)
    expect(result.value.updatedTarget).toBeUndefined()
  })

  it('MOVE never changes the original transaction position', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({
      plan: plan.value,
      reason: 'reason',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.updatedSource.transaction.batchPosition.batchNumber)).toBe(5)
    expect(Number(result.value.updatedSource.transaction.batchPosition.ritNumber)).toBe(1)
  })

  it('MOVE never mutates the original transaction.samplingEvaluation', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({ plan: plan.value, reason: 'reason', correctedAt, correctedBy })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.updatedSource.transaction.samplingEvaluation).toEqual(source.transaction.samplingEvaluation)
  })

  it('SWAP updates both source and target, exchanging their effective positions', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const target = acceptRecord('TX-2', 4, 9)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source, target])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({
      plan: plan.value,
      reason: 'Salah posisi ritase',
      correctedAt,
      correctedBy,
      generateCorrectionId: () => 'CORR-1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.value.updatedSource.effective.batchPosition.batchNumber)).toBe(4)
    expect(Number(result.value.updatedSource.effective.batchPosition.ritNumber)).toBe(9)
    expect(Number(result.value.updatedTarget!.effective.batchPosition.batchNumber)).toBe(5)
    expect(Number(result.value.updatedTarget!.effective.batchPosition.ritNumber)).toBe(1)
  })

  it('SWAP never changes either Transaction_ID', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const target = acceptRecord('TX-2', 4, 9)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source, target])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({ plan: plan.value, reason: 'reason', correctedAt, correctedBy })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.updatedSource.transaction.id).toBe('TX-1')
    expect(result.value.updatedTarget!.transaction.id).toBe('TX-2')
  })

  it('SWAP appends a SWITCH_POSITION correction to both records with identical reason/correctedAt/correctedBy', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const target = acceptRecord('TX-2', 4, 9)
    const plan = planProductionSwitch(source, fixturePosition(4, 9), [source, target])
    if (!plan.ok) throw new Error('setup failed')
    const result = applyProductionSwitchPlan({
      plan: plan.value,
      reason: 'Salah posisi ritase',
      correctedAt,
      correctedBy,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sourceCorrection = result.value.updatedSource.audit.corrections[0]!
    const targetCorrection = result.value.updatedTarget!.audit.corrections[0]!
    expect(sourceCorrection.type).toBe('SWITCH_POSITION')
    expect(targetCorrection.type).toBe('SWITCH_POSITION')
    expect(sourceCorrection.reason).toBe(targetCorrection.reason)
    expect(sourceCorrection.correctedAt).toEqual(targetCorrection.correctedAt)
    expect(sourceCorrection.correctedBy).toBe(targetCorrection.correctedBy)
  })

  it('preserves previously existing corrections on both source and target', () => {
    const source = acceptRecord('TX-1', 5, 1)
    const target = acceptRecord('TX-2', 4, 9)
    const firstPlan = planProductionSwitch(source, fixturePosition(4, 9), [source, target])
    if (!firstPlan.ok) throw new Error('setup failed')
    const firstResult = applyProductionSwitchPlan({ plan: firstPlan.value, reason: 'first', correctedAt, correctedBy })
    if (!firstResult.ok) throw new Error('setup failed')

    const secondPlan = planProductionSwitch(
      firstResult.value.updatedSource,
      fixturePosition(5, 1),
      [firstResult.value.updatedSource, firstResult.value.updatedTarget!],
    )
    if (!secondPlan.ok) throw new Error('setup failed')
    const secondResult = applyProductionSwitchPlan({ plan: secondPlan.value, reason: 'second', correctedAt, correctedBy })
    expect(secondResult.ok).toBe(true)
    if (!secondResult.ok) return
    expect(secondResult.value.updatedSource.audit.corrections).toHaveLength(2)
    expect(secondResult.value.updatedTarget!.audit.corrections).toHaveLength(2)
  })
})
