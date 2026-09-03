import { describe, expect, it } from 'vitest'
import { parseSamplingHouseCode, parseSectorCode } from '../common/codes'
import { parseEmployeeId, parseTruckId } from '../common/identifiers'
import { parseCrewCode, parseHaulerCode, parseLocationCode, parsePileAreaCode } from './master-codes'
import {
  createCrewReference,
  createEmployeeReference,
  createHaulerReference,
  createLocationReference,
  createPileAreaReference,
  createSamplingHouseReference,
  createSectorReference,
  createTruckReference,
} from './references'

describe('EmployeeReference', () => {
  it('preserves the NIK/id and name confirmed by BR-MAN-001', () => {
    const id = parseEmployeeId('12345')
    expect(id.ok).toBe(true)
    if (!id.ok) return

    const employee = createEmployeeReference(id.value, 'John Doe')
    expect(employee.id).toBe(id.value)
    expect(employee.name).toBe('John Doe')
  })
})

describe('minimal master references', () => {
  it('creates a CrewReference from a validated CrewCode', () => {
    const code = parseCrewCode('CREW-A')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createCrewReference(code.value).code).toBe(code.value)
  })

  it('creates a SectorReference from a validated SectorCode', () => {
    const code = parseSectorCode('BR1')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createSectorReference(code.value).code).toBe(code.value)
  })

  it('creates a LocationReference from a validated LocationCode', () => {
    const code = parseLocationCode('L18')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createLocationReference(code.value).code).toBe(code.value)
  })

  it('creates a SamplingHouseReference from a validated SamplingHouseCode', () => {
    const code = parseSamplingHouseCode('HOUSE-1')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createSamplingHouseReference(code.value).code).toBe(code.value)
  })

  it('creates a PileAreaReference from a validated PileAreaCode, distinct from PileId', () => {
    const code = parsePileAreaCode('AREA-1')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createPileAreaReference(code.value).code).toBe(code.value)
  })

  it('creates a HaulerReference from a validated HaulerCode', () => {
    const code = parseHaulerCode('PT-ABC')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createHaulerReference(code.value).code).toBe(code.value)
  })
})

describe('TruckReference', () => {
  it('ties a TruckId to a HaulerCode, without any front/fleet concept', () => {
    const id = parseTruckId('DT-2045')
    const haulerCode = parseHaulerCode('PT-ABC')
    expect(id.ok && haulerCode.ok).toBe(true)
    if (!id.ok || !haulerCode.ok) return

    const truckReference = createTruckReference(id.value, haulerCode.value)
    expect(truckReference.id).toBe(id.value)
    expect(truckReference.haulerCode).toBe(haulerCode.value)
    expect(Object.keys(truckReference).sort()).toEqual(['haulerCode', 'id'])
  })
})
