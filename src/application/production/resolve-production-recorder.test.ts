import { describe, expect, it } from 'vitest'
import { resolveProductionRecorder } from '@/application/production/resolve-production-recorder'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'

describe('resolveProductionRecorder', () => {
  it('resolves the single Checker assignment\'s personId as createdBy', () => {
    const manpower = [
      createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Checker', true),
      createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false),
    ]
    const result = resolveProductionRecorder(manpower)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('SCM0333')
  })

  it('does not use isPic as the criterion — a PIC who is not a Checker is ignored', () => {
    const manpower = [
      createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Foreman', true),
      createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Checker', false),
    ]
    const result = resolveProductionRecorder(manpower)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('260225')
  })

  it('fails with PRODUCTION_CHECKER_NOT_ASSIGNED when no Checker is assigned', () => {
    const manpower = [createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Foreman', true)]
    const result = resolveProductionRecorder(manpower)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_CHECKER_NOT_ASSIGNED')
  })

  it('fails with PRODUCTION_CHECKER_NOT_ASSIGNED for an empty manpower roster', () => {
    const result = resolveProductionRecorder([])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_CHECKER_NOT_ASSIGNED')
  })

  it('fails with PRODUCTION_CHECKER_AMBIGUOUS when more than one Checker is assigned, never picking the first', () => {
    const manpower = [
      createManpowerAssignment('SCM0333', 'Raharjo Rahman', 'Checker', true),
      createManpowerAssignment('SCM0627', 'Wahyudin Madilao', 'Checker', true),
    ]
    const result = resolveProductionRecorder(manpower)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PRODUCTION_CHECKER_AMBIGUOUS')
  })
})
