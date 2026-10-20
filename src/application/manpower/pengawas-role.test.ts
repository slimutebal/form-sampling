import { describe, expect, it } from 'vitest'
import { parseEmployeeId } from '@/domain/common/identifiers'
import { createMasterData } from '@/domain/master/master-data'
import { createEmployeeReference } from '@/domain/master/references'
import { isPengawasEmployee } from './pengawas-role'

function must<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

describe('isPengawasEmployee', () => {
  it('accepts explicit supervisory Levels but never an ordinary Staff or an unset Checker', () => {
    const supervisor = must(parseEmployeeId('SUP-1'))
    const ordinaryStaff = must(parseEmployeeId('STAFF-1'))
    const checker = must(parseEmployeeId('CHECKER-1'))
    const masterData = must(createMasterData({
      employees: [
        createEmployeeReference(supervisor, 'Supervisor', 'Supervisor'),
        createEmployeeReference(ordinaryStaff, 'Ordinary Staff', 'Staff'),
        createEmployeeReference(checker, 'Checker'),
      ],
      crews: [], sectors: [], locations: [], samplingHouses: [], pileAreas: [], haulers: [], trucks: [], oreSamplingConfigs: [],
    }))

    expect(isPengawasEmployee(supervisor, masterData)).toBe(true)
    expect(isPengawasEmployee(ordinaryStaff, masterData)).toBe(false)
    expect(isPengawasEmployee(checker, masterData)).toBe(false)
  })
})
