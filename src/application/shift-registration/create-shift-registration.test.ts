import { describe, expect, it } from 'vitest'
import { createShiftRegistration, type ShiftRegistrationInput } from './create-shift-registration'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createSamplingHouseReference, createSectorReference } from '@/domain/master/references'
import { parseSamplingHouseCode, parseSectorCode } from '@/domain/common/codes'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildTestMasterData(): MasterData {
  const sec = must(parseSectorCode('SEC'))
  const house = must(parseSamplingHouseCode('HOUSE'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(sec)],
      locations: [],
      samplingHouses: [createSamplingHouseReference(sec, house)],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

const MASTER_DATA = buildTestMasterData()

const VALID_INPUT: ShiftRegistrationInput = {
  shiftId: 'fixed-shift-id-001',
  shiftDate: '2026-09-04',
  shiftCode: 'DS',
  sectorCode: 'SEC',
  samplingHouseCode: 'HOUSE',
  masterData: MASTER_DATA,
}

describe('createShiftRegistration', () => {
  it('A. builds a valid Shift in status NEW with every field preserved', () => {
    const result = createShiftRegistration(VALID_INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('fixed-shift-id-001')
    expect(result.value.date).toBe('2026-09-04')
    expect(result.value.shiftCode).toBe('DS')
    expect(result.value.sectorCode).toBe('SEC')
    expect(result.value.samplingHouseCode).toBe('HOUSE')
    expect(result.value.status).toBe('NEW')
  })

  it('B. trims surrounding whitespace on code fields, matching existing parser behavior', () => {
    const result = createShiftRegistration({
      ...VALID_INPUT,
      shiftCode: '  DS  ',
      sectorCode: '  SEC  ',
      samplingHouseCode: '  HOUSE  ',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.shiftCode).toBe('DS')
    expect(result.value.sectorCode).toBe('SEC')
    expect(result.value.samplingHouseCode).toBe('HOUSE')
  })

  it('C. rejects an invalid shift date', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, shiftDate: '2026-13-04' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_SHIFT_DATE_MONTH')
  })

  it('D. rejects a blank shift code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, shiftCode: '   ' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SHIFT_CODE')
  })

  it('E. rejects a blank sector code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, sectorCode: '' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SECTOR_CODE')
  })

  it('F. rejects a blank sampling house code', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, samplingHouseCode: '' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('BLANK_SAMPLING_HOUSE_CODE')
  })

  it('G. rejects a shift code outside the closed DS/NS set', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, shiftCode: 'D' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_CODE_NOT_ALLOWED')
  })

  it('H. rejects a Sector not present in MasterData', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, sectorCode: 'UNKNOWN' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REGISTRATION_SECTOR_NOT_FOUND')
  })

  it('I. rejects a Sampling House pair not present in MasterData', () => {
    const result = createShiftRegistration({ ...VALID_INPUT, samplingHouseCode: 'UNKNOWN' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REGISTRATION_SAMPLING_HOUSE_NOT_FOUND')
  })
})
