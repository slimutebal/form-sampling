import { describe, expect, it } from 'vitest'
import { createManpowerFromDraft, type ManpowerDraftEntry } from '@/application/manpower/create-manpower-from-draft'
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

describe('createManpowerFromDraft', () => {
  it('resolves a valid Employee and Crew entry, deriving isPic from master membership', () => {
    const entries: ManpowerDraftEntry[] = [
      { personId: 'SCM0333', jobDeskCode: 'Checker' },
      { personId: '260225', jobDeskCode: 'Sampler' },
    ]
    const result = createManpowerFromDraft(entries, buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { personId: 'SCM0333', name: 'Raharjo Rahman', jobDeskCode: 'Checker', isPic: true },
      { personId: '260225', name: 'Andri Tani Kusuma', jobDeskCode: 'Sampler', isPic: false },
    ])
  })

  it('marks every Employee/Staff entry as PIC, allowing multiple Staff/PIC at once', () => {
    const masterData = value(
      createMasterData({
        employees: [
          createEmployeeReference(value(parseEmployeeId('SCM0333')), 'Raharjo Rahman'),
          createEmployeeReference(value(parseEmployeeId('SCM0627')), 'Wahyudin Madilao'),
        ],
        crews: [],
        sectors: [],
        locations: [],
        samplingHouses: [],
        pileAreas: [],
        haulers: [],
        trucks: [],
        oreSamplingConfigs: [],
      }),
    )
    const entries: ManpowerDraftEntry[] = [
      { personId: 'SCM0333', jobDeskCode: '' },
      { personId: 'SCM0627', jobDeskCode: '' },
    ]
    const result = createManpowerFromDraft(entries, masterData)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.every((assignment) => assignment.isPic)).toBe(true)
  })

  it('rejects a personId that resolves to neither the Employee nor the Crew master', () => {
    const entries: ManpowerDraftEntry[] = [{ personId: 'UNKNOWN', jobDeskCode: 'Checker' }]
    const result = createManpowerFromDraft(entries, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MANPOWER_PERSON_NOT_FOUND')
  })

  it('rejects a duplicate personId within the same draft', () => {
    const entries: ManpowerDraftEntry[] = [
      { personId: 'SCM0333', jobDeskCode: 'Checker' },
      { personId: 'SCM0333', jobDeskCode: 'Sampler' },
    ]
    const result = createManpowerFromDraft(entries, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_MANPOWER_PERSON_ID')
  })

  it('rejects a blank Job Desk for a Crew entry', () => {
    const entries: ManpowerDraftEntry[] = [{ personId: '260225', jobDeskCode: '  ' }]
    const result = createManpowerFromDraft(entries, buildMasterData())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_MANPOWER_JOB_DESK')
  })

  it('accepts a blank Job Desk for a Staff/Employee entry — the Staff master has no exact Job field', () => {
    const entries: ManpowerDraftEntry[] = [{ personId: 'SCM0333', jobDeskCode: '  ' }]
    const result = createManpowerFromDraft(entries, buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ personId: 'SCM0333', name: 'Raharjo Rahman', jobDeskCode: '  ', isPic: true }])
  })

  it('accepts an empty draft (Manpower is not mandatory)', () => {
    const result = createManpowerFromDraft([], buildMasterData())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })
})
