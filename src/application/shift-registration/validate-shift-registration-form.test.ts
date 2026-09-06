import { describe, expect, it } from 'vitest'
import { validateShiftRegistrationForm } from './validate-shift-registration-form'
import type { ShiftRegistrationFormValues } from './shift-registration-form-values'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createSamplingHouseReference, createSectorReference } from '@/domain/master/references'
import { parseSamplingHouseCode, parseSectorCode } from '@/domain/common/codes'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildTestMasterData(): MasterData {
  const sec = must(parseSectorCode('SEC'))
  const otherSector = must(parseSectorCode('OTHER'))
  const house = must(parseSamplingHouseCode('HOUSE'))
  const result = createMasterData({
    employees: [],
    crews: [],
    sectors: [createSectorReference(sec), createSectorReference(otherSector)],
    locations: [],
    samplingHouses: [createSamplingHouseReference(sec, house)],
    pileAreas: [],
    haulers: [],
    trucks: [],
    oreSamplingConfigs: [],
  })
  return must(result)
}

const MASTER_DATA = buildTestMasterData()

const VALID_VALUES: ShiftRegistrationFormValues = {
  shiftDate: '2026-09-04',
  shiftCode: 'DS',
  sectorCode: 'SEC',
  samplingHouseCode: 'HOUSE',
}

describe('validateShiftRegistrationForm', () => {
  it('B. reports all four required field errors when every field is blank', () => {
    const result = validateShiftRegistrationForm(
      { shiftDate: '', shiftCode: '', sectorCode: '', samplingHouseCode: '' },
      MASTER_DATA,
    )

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBeDefined()
    expect(result.fieldErrors.shiftCode).toBeDefined()
    expect(result.fieldErrors.sectorCode).toBeDefined()
    expect(result.fieldErrors.samplingHouseCode).toBeDefined()
  })

  it('C. an invalid date maps only to the shiftDate field, leaving other fields valid', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, shiftDate: '2026-13-04' }, MASTER_DATA)

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBe('INVALID_SHIFT_DATE_MONTH')
    expect(result.fieldErrors.shiftCode).toBeUndefined()
    expect(result.fieldErrors.sectorCode).toBeUndefined()
    expect(result.fieldErrors.samplingHouseCode).toBeUndefined()
  })

  it('D. valid input produces parsed fields with every value preserved', () => {
    const result = validateShiftRegistrationForm(VALID_VALUES, MASTER_DATA)

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.fields.shiftDate).toBe('2026-09-04')
    expect(result.fields.shiftCode).toBe('DS')
    expect(result.fields.sectorCode).toBe('SEC')
    expect(result.fields.samplingHouseCode).toBe('HOUSE')
  })

  it('E. trims surrounding whitespace on code fields, matching existing parser behavior', () => {
    const result = validateShiftRegistrationForm(
      { ...VALID_VALUES, shiftCode: '  DS  ', sectorCode: '  SEC  ', samplingHouseCode: '  HOUSE  ' },
      MASTER_DATA,
    )

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.fields.shiftCode).toBe('DS')
    expect(result.fields.sectorCode).toBe('SEC')
    expect(result.fields.samplingHouseCode).toBe('HOUSE')
  })

  it('an empty (not just invalid) date reports the friendlier required code', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, shiftDate: '' }, MASTER_DATA)

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftDate).toBe('REQUIRED_SHIFT_DATE')
  })

  it('F. rejects a shiftCode outside the closed DS/NS set', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, shiftCode: 'D' }, MASTER_DATA)

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.shiftCode).toBe('SHIFT_CODE_NOT_ALLOWED')
  })

  it('G. rejects a Sector not present in MasterData', () => {
    const result = validateShiftRegistrationForm({ ...VALID_VALUES, sectorCode: 'UNKNOWN' }, MASTER_DATA)

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.sectorCode).toBe('REGISTRATION_SECTOR_NOT_FOUND')
  })

  it('H. rejects a Sampling House not present under the selected Sector, even if it exists under another Sector', () => {
    const result = validateShiftRegistrationForm(
      { ...VALID_VALUES, sectorCode: 'OTHER', samplingHouseCode: 'HOUSE' },
      MASTER_DATA,
    )

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.samplingHouseCode).toBe('REGISTRATION_SAMPLING_HOUSE_NOT_FOUND')
  })

  it('I. an unresolved Sector does not also produce a Sampling House error', () => {
    const result = validateShiftRegistrationForm(
      { ...VALID_VALUES, sectorCode: 'UNKNOWN', samplingHouseCode: 'HOUSE' },
      MASTER_DATA,
    )

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.fieldErrors.sectorCode).toBe('REGISTRATION_SECTOR_NOT_FOUND')
    expect(result.fieldErrors.samplingHouseCode).toBeUndefined()
  })
})
