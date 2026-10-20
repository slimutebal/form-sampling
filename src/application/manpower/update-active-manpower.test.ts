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
    const existing = [createManpowerAssignment('CHECKER', 'Historic Checker', 'Checker', false)]
    const result = updateActiveManpower(existing, [
      { personId: 'CHECKER', jobDeskCode: 'Checker', isChecker: true },
      { personId: 'EMP-B', jobDeskCode: '', isChecker: false },
    ], catalog())
    expect(result).toEqual({ ok: true, value: {
      manpower: [
        createManpowerAssignment('CHECKER', 'Historic Checker', 'Checker', false),
        createManpowerAssignment('EMP-B', 'Employee B', '', true),
      ],
      checkerPersonId: 'CHECKER',
    } })
  })

  it('keeps an existing Crew Checker when it no longer exists in the refreshed catalog', () => {
    const existing = [createManpowerAssignment('RETIRED', 'Historic Worker', 'Checker', false)]
    const result = updateActiveManpower(existing, [{ personId: 'RETIRED', jobDeskCode: 'Checker', isChecker: true }], catalog())
    expect(result).toEqual({ ok: true, value: { manpower: existing, checkerPersonId: 'RETIRED' } })
  })

  it('requires exactly one Checker', () => {
    const result = updateActiveManpower([], [{ personId: 'EMP-B', jobDeskCode: '', isChecker: false }], catalog())
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CHECKER_COUNT' } })
  })

  it('assigns Checker to Staff without replacing the Staff job description', () => {
    const existing = [
      createManpowerAssignment('EMP-A', 'Employee A', 'Supervisor', true),
      createManpowerAssignment('CHECKER', 'Crew Checker', 'Checker', false),
    ]
    const result = updateActiveManpower(existing, [
      { personId: 'EMP-A', jobDeskCode: 'Supervisor', isChecker: true },
      { personId: 'CHECKER', jobDeskCode: 'Checker', isChecker: false },
    ], catalog())
    expect(result).toEqual({ ok: true, value: {
      manpower: [
        createManpowerAssignment('EMP-A', 'Employee A', 'Supervisor', true),
        createManpowerAssignment('CHECKER', 'Crew Checker', 'Sampler', false),
      ],
      checkerPersonId: 'EMP-A',
    } })
  })

  it('re-saves legacy blank and Sampler Crew assignments as Sampler while retaining Checker', () => {
    const existing = [
      createManpowerAssignment('CHECKER', 'Checker', 'Checker', false),
      createManpowerAssignment('230268', 'Takdir', '', false),
      createManpowerAssignment('230235', 'Ismail', 'Sampler', false),
    ]
    const result = updateActiveManpower(existing, [
      { personId: 'CHECKER', jobDeskCode: 'Checker', isChecker: true },
      { personId: '230268', jobDeskCode: '', isChecker: false },
      { personId: '230235', jobDeskCode: 'Sampler', isChecker: false },
    ], catalog())
    expect(result).toEqual({
      ok: true,
      value: {
        manpower: [
        createManpowerAssignment('CHECKER', 'Checker', 'Checker', false),
        createManpowerAssignment('230268', 'Takdir', 'Sampler', false),
        createManpowerAssignment('230235', 'Ismail', 'Sampler', false),
        ],
        checkerPersonId: 'CHECKER',
      },
    })
  })
})
