import { describe, expect, it } from 'vitest'
import { parseEmployeeId } from '@/domain/common/identifiers'
import { createMasterData } from '@/domain/master/master-data'
import { createEmployeeReference } from '@/domain/master/references'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { updateActiveManpower } from './update-active-manpower'

function must<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function catalog() {
  return must(createMasterData({
    employees: [
      createEmployeeReference(must(parseEmployeeId('EMP-A')), 'Employee A', 'Supervisor'),
      createEmployeeReference(must(parseEmployeeId('EMP-B')), 'Employee B', 'Foreman'),
    ],
    crews: [], sectors: [], locations: [], samplingHouses: [], pileAreas: [], haulers: [], trucks: [], oreSamplingConfigs: [],
  }))
}

describe('updateActiveManpower', () => {
  it('preserves existing assignments while allowing a newly refreshed Employee to be added', () => {
    const existing = [createManpowerAssignment('EMP-A', 'Historic Employee A', 'Checker', true)]
    const result = updateActiveManpower(existing, [
      { personId: 'EMP-A', jobDeskCode: 'Checker' },
      { personId: 'EMP-B', jobDeskCode: '' },
    ], catalog())
    expect(result).toEqual({ ok: true, value: [
      createManpowerAssignment('EMP-A', 'Historic Employee A', 'Checker', true),
      createManpowerAssignment('EMP-B', 'Employee B', '', true),
    ] })
  })

  it('keeps an existing assignment when it no longer exists in the refreshed catalog', () => {
    const existing = [createManpowerAssignment('RETIRED', 'Historic Worker', 'Checker', true)]
    const result = updateActiveManpower(existing, [{ personId: 'RETIRED', jobDeskCode: 'Checker' }], catalog())
    expect(result).toEqual({ ok: true, value: existing })
  })

  it('requires exactly one Checker', () => {
    const result = updateActiveManpower([], [{ personId: 'EMP-B', jobDeskCode: '' }], catalog())
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CHECKER_COUNT' } })
  })
})
