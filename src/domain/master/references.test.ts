import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode } from '../common/codes'
import { parseEmployeeId, parsePileId, parseTruckId } from '../common/identifiers'
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
  it('creates a CrewReference from a validated CrewCode, with name and optional jobCode', () => {
    const code = parseCrewCode('CREW-A')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    const crew = createCrewReference(code.value, 'Crew A', 'Sampler')
    expect(crew.code).toBe(code.value)
    expect(crew.name).toBe('Crew A')
    expect(crew.jobCode).toBe('Sampler')
    expect(createCrewReference(code.value, 'Crew A').jobCode).toBeUndefined()
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

  it('creates a SamplingHouseReference tied to a SectorCode, since the code alone is not unique', () => {
    const sectorCode = parseSectorCode('BR1')
    const code = parseSamplingHouseCode('SH_01')
    expect(sectorCode.ok && code.ok).toBe(true)
    if (!sectorCode.ok || !code.ok) return
    const house = createSamplingHouseReference(sectorCode.value, code.value)
    expect(house.sectorCode).toBe(sectorCode.value)
    expect(house.code).toBe(code.value)
  })

  it('creates a PileAreaReference from Sector/Stockpile/Pile/Ore, distinct from a Pile domain instance', () => {
    const sectorCode = parseSectorCode('BR1')
    const stockpileCode = parsePileAreaCode('AREA-1')
    const pileId = parsePileId('PILE-1')
    const oreCode = parseOreCode('SAP')
    expect(sectorCode.ok && stockpileCode.ok && pileId.ok && oreCode.ok).toBe(true)
    if (!sectorCode.ok || !stockpileCode.ok || !pileId.ok || !oreCode.ok) return
    const pileArea = createPileAreaReference(sectorCode.value, stockpileCode.value, pileId.value, oreCode.value)
    expect(pileArea.sectorCode).toBe(sectorCode.value)
    expect(pileArea.stockpileCode).toBe(stockpileCode.value)
    expect(pileArea.pileId).toBe(pileId.value)
    expect(pileArea.oreCode).toBe(oreCode.value)
  })

  it('creates a HaulerReference from a validated HaulerCode and Name', () => {
    const code = parseHaulerCode('PT-ABC')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    const hauler = createHaulerReference(code.value, 'PT ABC Transport')
    expect(hauler.code).toBe(code.value)
    expect(hauler.name).toBe('PT ABC Transport')
  })

  it('defaults HaulerReference.name to an empty string when omitted', () => {
    const code = parseHaulerCode('PT-ABC')
    expect(code.ok).toBe(true)
    if (!code.ok) return
    expect(createHaulerReference(code.value).name).toBe('')
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
