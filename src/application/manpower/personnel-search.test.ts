import { describe, expect, it } from 'vitest'
import { searchPersonnel } from '@/application/manpower/personnel-search'
import { parseEmployeeId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseCrewCode } from '@/domain/master/master-codes'
import { createCrewReference, createEmployeeReference } from '@/domain/master/references'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function buildMasterData(): MasterData {
  return value(
    createMasterData({
      employees: [createEmployeeReference(value(parseEmployeeId('SCM0333')), 'Raharjo Rahman')],
      crews: [createCrewReference(value(parseCrewCode('260225')), 'Andri Tani Kusuma', 'Sampler')],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

describe('searchPersonnel', () => {
  const masterData = buildMasterData()

  it('matches an Employee by NIK', () => {
    expect(searchPersonnel(masterData, 'SCM0333')).toEqual([
      { personId: 'SCM0333', name: 'Raharjo Rahman', source: 'EMPLOYEE' },
    ])
  })

  it('matches an Employee by name, case-insensitively', () => {
    expect(searchPersonnel(masterData, 'raharjo')).toEqual([
      { personId: 'SCM0333', name: 'Raharjo Rahman', source: 'EMPLOYEE' },
    ])
  })

  it('matches a Crew by code or name, surfacing its master jobCode for prefill', () => {
    expect(searchPersonnel(masterData, '260225')).toEqual([
      { personId: '260225', name: 'Andri Tani Kusuma', source: 'CREW', jobCode: 'Sampler' },
    ])
    expect(searchPersonnel(masterData, 'Andri')).toEqual([
      { personId: '260225', name: 'Andri Tani Kusuma', source: 'CREW', jobCode: 'Sampler' },
    ])
  })

  it('does not surface a jobCode for an Employee — the Staff master has no Job field', () => {
    expect(searchPersonnel(masterData, 'SCM0333')).toEqual([
      { personId: 'SCM0333', name: 'Raharjo Rahman', source: 'EMPLOYEE' },
    ])
  })

  it('returns nothing for a blank query rather than dumping the whole master', () => {
    expect(searchPersonnel(masterData, '   ')).toEqual([])
  })

  it('returns nothing for a query that matches neither master', () => {
    expect(searchPersonnel(masterData, 'nobody')).toEqual([])
  })
})
