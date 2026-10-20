import { describe, expect, it } from 'vitest'
import { parseSectorCode, parseShiftCode, parseSamplingHouseCode } from '@/domain/common/codes'
import { parseFleetId, parseFrontId, parseShiftId } from '@/domain/common/identifiers'
import type { Result } from '@/domain/common/result'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createBaseFleetDefinition } from '@/domain/fleet/fleet-definition'
import { createFrontDefinition } from '@/domain/fleet/front'
import {
  createFleetAssignmentIdentity,
  formatFleetFullCode,
  formatFleetShortLabel,
  resolveFleetAssignmentIdentity,
} from '@/domain/fleet/fleet-assignment-identity'
import { parseHaulerCode } from '@/domain/master/master-codes'
import { createShift } from '@/domain/shift/shift'

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const date = must(parseShiftDate('2026-10-18'))
const sector = must(parseSectorCode('BR1'))
const company = must(parseHaulerCode('H1'))
const frontId = must(parseFrontId('BR1/01'))

describe('FleetAssignmentIdentity', () => {
  it('keeps Fleet_01 separate from stable full codes across shifts', () => {
    const day = must(createFleetAssignmentIdentity({
      fleetAssignmentId: must(parseFleetId('assignment-day')),
      fleetSequence: 1,
      originShiftId: must(parseShiftId('shift-day')),
      operationalDate: date,
      shiftCode: must(parseShiftCode('D')),
      sectorCode: sector,
      frontId,
      company,
    }))
    const night = must(createFleetAssignmentIdentity({
      fleetAssignmentId: must(parseFleetId('assignment-night')),
      fleetSequence: 1,
      originShiftId: must(parseShiftId('shift-night')),
      operationalDate: date,
      shiftCode: must(parseShiftCode('N')),
      sectorCode: sector,
      frontId,
      company,
    }))

    expect(formatFleetShortLabel(1)).toBe('Fleet_01')
    expect(day.fleetCode).toBe('261018D-BR1-F01')
    expect(night.fleetCode).toBe('261018N-BR1-F01')
    expect(day.fleetAssignmentId).not.toBe(night.fleetAssignmentId)
  })

  it('resolves a legacy Fleet only when its stored Shift and canonical Front determine every code component', () => {
    const shift = createShift({
      id: must(parseShiftId('legacy-shift')),
      date,
      shiftCode: must(parseShiftCode('D')),
      sectorCode: sector,
      samplingHouseCode: must(parseSamplingHouseCode('HOUSE-1')),
      status: 'ACTIVE',
    })
    const front = createFrontDefinition(frontId, sector, company)
    const fleet = must(createBaseFleetDefinition({
      fleetId: must(parseFleetId('legacy-fleet')),
      frontId,
      truckIds: [],
    }))

    expect(resolveFleetAssignmentIdentity(fleet, front, shift)).toMatchObject({
      status: 'RESOLVED',
      source: 'LEGACY_DETERMINISTIC',
      identity: { fleetCode: formatFleetFullCode({ operationalDate: date, shiftCode: 'D', sectorCode: 'BR1', sequence: 1 }) },
    })
    expect(resolveFleetAssignmentIdentity(fleet, undefined, shift)).toMatchObject({ status: 'UNRESOLVED' })
  })
})
