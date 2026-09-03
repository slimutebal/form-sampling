import { describe, expect, it } from 'vitest'
import { parseOreCode, parseSectorCode } from '../common/codes'
import { parseTruckId } from '../common/identifiers'
import { parseHaulerCode, parsePileAreaCode } from './master-codes'
import { createSectorReference, createTruckReference, type TruckReference } from './references'
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
  type OreSamplingConfig,
} from './sampling-config'
import {
  createMasterData,
  findOreSamplingConfig,
  findTruck,
  validateMasterOreSamplingConfigs,
  validateMasterSectors,
  validateMasterTrucks,
  type MasterData,
  type MasterDataInput,
} from './master-data'

function truck(idValue: string, haulerValue: string): TruckReference {
  const id = parseTruckId(idValue)
  const haulerCode = parseHaulerCode(haulerValue)
  if (!id.ok || !haulerCode.ok) throw new Error('invalid test fixture')
  return createTruckReference(id.value, haulerCode.value)
}

function oreConfig(oreCodeValue: string, interval: number, batchSize: number, packing: number): OreSamplingConfig {
  const oreCode = parseOreCode(oreCodeValue)
  const parsedInterval = parseSamplingInterval(interval)
  const parsedBatchSize = parseBatchSize(batchSize)
  const parsedPacking = parsePackingConfigValue(packing)
  if (!oreCode.ok || !parsedInterval.ok || !parsedBatchSize.ok || !parsedPacking.ok) {
    throw new Error('invalid test fixture')
  }
  return createOreSamplingConfig({
    oreCode: oreCode.value,
    interval: parsedInterval.value,
    batchSize: parsedBatchSize.value,
    packing: parsedPacking.value,
  })
}

describe('Truck / Hauler master', () => {
  it('represents multiple trucks belonging to haulers', () => {
    const trucks = [truck('DT-2045', 'PT-ABC'), truck('DT-2071', 'PT-ABC'), truck('DT-9001', 'PT-XYZ')]
    expect(trucks).toHaveLength(3)
    expect(trucks[0].haulerCode).toBe('PT-ABC')
    expect(trucks[2].haulerCode).toBe('PT-XYZ')
  })

  it('keeps TruckId and HaulerCode as distinct branded concepts at compile time', () => {
    const id = parseTruckId('DT-2045')
    const haulerCode = parseHaulerCode('PT-ABC')
    expect(id.ok).toBe(true)
    expect(haulerCode.ok).toBe(true)
    if (id.ok && haulerCode.ok) {
      // @ts-expect-error TruckId and HaulerCode are distinct branded types and must not be interchangeable
      const misused: typeof haulerCode.value = id.value
      expect(misused).toBe(id.value)
    }
  })
})

describe('master collection duplicate validation', () => {
  it('accepts a valid, non-duplicate truck collection', () => {
    const trucks = [truck('DT-2045', 'PT-ABC'), truck('DT-2071', 'PT-ABC')]
    const result = validateMasterTrucks(trucks)
    expect(result.ok).toBe(true)
  })

  it('rejects duplicate TruckId within a truck collection', () => {
    const trucks = [truck('DT-2045', 'PT-ABC'), truck('DT-2045', 'PT-XYZ')]
    const result = validateMasterTrucks(trucks)
    expect(result.ok).toBe(false)
  })

  it('rejects duplicate OreCode within an ore sampling config collection', () => {
    const configs = [oreConfig('SAP', 2, 20, 2), oreConfig('SAP', 5, 100, 10)]
    const result = validateMasterOreSamplingConfigs(configs)
    expect(result.ok).toBe(false)
  })

  it('accepts a valid, non-duplicate ore sampling config collection', () => {
    const configs = [oreConfig('SAP', 2, 20, 2), oreConfig('LIM', 5, 100, 10)]
    const result = validateMasterOreSamplingConfigs(configs)
    expect(result.ok).toBe(true)
  })

  it('rejects duplicate SectorCode within a sector collection', () => {
    const codeA = parseSectorCode('BR1')
    const codeB = parseSectorCode('BR1')
    expect(codeA.ok && codeB.ok).toBe(true)
    if (!codeA.ok || !codeB.ok) return
    const result = validateMasterSectors([createSectorReference(codeA.value), createSectorReference(codeB.value)])
    expect(result.ok).toBe(false)
  })

  it('does not mutate the input array while checking for duplicates', () => {
    const trucks = [truck('DT-2045', 'PT-ABC'), truck('DT-2071', 'PT-ABC')]
    const originalIds = trucks.map((t) => t.id)

    validateMasterTrucks(trucks)

    expect(trucks.map((t) => t.id)).toEqual(originalIds)
  })
})

describe('createMasterData', () => {
  function buildValidMasterData(): MasterData {
    const result = createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [truck('DT-2045', 'PT-ABC'), truck('DT-2071', 'PT-ABC')],
      oreSamplingConfigs: [oreConfig('SAP', 2, 20, 2), oreConfig('LIM', 5, 100, 10)],
    })
    if (!result.ok) throw new Error('invalid test fixture')
    return result.value
  }

  it('builds a valid snapshot from non-duplicate collections', () => {
    const masterData = buildValidMasterData()
    expect(masterData.trucks).toHaveLength(2)
    expect(masterData.oreSamplingConfigs).toHaveLength(2)
  })

  it('fails when the truck collection contains a duplicate TruckId', () => {
    const result = createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [truck('DT-2045', 'PT-ABC'), truck('DT-2045', 'PT-XYZ')],
      oreSamplingConfigs: [],
    })
    expect(result.ok).toBe(false)
  })

  it('does not mutate caller-owned collection arrays', () => {
    const trucks = [truck('DT-2045', 'PT-ABC')]
    const oreSamplingConfigs = [oreConfig('SAP', 2, 20, 2)]

    createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks,
      oreSamplingConfigs,
    })

    expect(trucks).toHaveLength(1)
    expect(oreSamplingConfigs).toHaveLength(1)
  })

  it('isolates the snapshot from later mutation of the caller-owned trucks array', () => {
    const trucks = [truck('DT-2045', 'PT-ABC')]

    const result = createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks,
      oreSamplingConfigs: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    trucks.push(truck('DT-9999', 'PT-XYZ'))

    expect(result.value.trucks).toHaveLength(1)
    expect(result.value.trucks[0].id).toBe('DT-2045')
  })

  it('isolates the snapshot from later mutation of the caller-owned oreSamplingConfigs array', () => {
    const oreSamplingConfigs = [oreConfig('SAP', 2, 20, 2)]

    const result = createMasterData({
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    oreSamplingConfigs.push(oreConfig('LIM', 5, 100, 10))

    expect(result.value.oreSamplingConfigs).toHaveLength(1)
    expect(result.value.oreSamplingConfigs[0].oreCode).toBe('SAP')
  })

  it('supports more than two ore configs, more than six pile areas, and an arbitrary number of trucks/sectors', () => {
    const ores = ['SAP', 'LIM', 'FUTURE_A', 'FUTURE_B', 'FUTURE_C'].map((code, index) =>
      oreConfig(code, index + 1, (index + 1) * 10, index + 1),
    )
    const pileAreas = Array.from({ length: 9 }, (_, index) => {
      const code = parsePileAreaCode(`AREA-${index + 1}`)
      if (!code.ok) throw new Error('invalid test fixture')
      return { code: code.value }
    })
    const trucks = Array.from({ length: 20 }, (_, index) => truck(`DT-${1000 + index}`, 'PT-ABC'))
    const sectors = Array.from({ length: 10 }, (_, index) => {
      const code = parseSectorCode(`SECTOR-${index + 1}`)
      if (!code.ok) throw new Error('invalid test fixture')
      return createSectorReference(code.value)
    })

    const result = createMasterData({
      employees: [],
      crews: [],
      sectors,
      locations: [],
      samplingHouses: [],
      pileAreas,
      haulers: [],
      trucks,
      oreSamplingConfigs: ores,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.oreSamplingConfigs.length).toBeGreaterThan(2)
    expect(result.value.pileAreas.length).toBeGreaterThan(6)
    expect(result.value.trucks).toHaveLength(20)
    expect(result.value.sectors).toHaveLength(10)
  })

  it('lookup: known OreCode returns the correct config', () => {
    const masterData = buildValidMasterData()
    const sap = parseOreCode('SAP')
    expect(sap.ok).toBe(true)
    if (!sap.ok) return

    const config = findOreSamplingConfig(masterData, sap.value)
    expect(config).toBeDefined()
    expect(Number(config?.batchSize)).toBe(20)
  })

  it('lookup: unknown OreCode produces explicit not-found (undefined)', () => {
    const masterData = buildValidMasterData()
    const unknown = parseOreCode('UNKNOWN_ORE')
    expect(unknown.ok).toBe(true)
    if (!unknown.ok) return

    expect(findOreSamplingConfig(masterData, unknown.value)).toBeUndefined()
  })

  it('lookup: known TruckId returns the correct truck', () => {
    const masterData = buildValidMasterData()
    const truckId = parseTruckId('DT-2045')
    expect(truckId.ok).toBe(true)
    if (!truckId.ok) return

    const found = findTruck(masterData, truckId.value)
    expect(found).toBeDefined()
    expect(found?.haulerCode).toBe('PT-ABC')
  })

  it('lookup: unknown TruckId produces explicit not-found (undefined)', () => {
    const masterData = buildValidMasterData()
    const unknown = parseTruckId('DT-9999')
    expect(unknown.ok).toBe(true)
    if (!unknown.ok) return

    expect(findTruck(masterData, unknown.value)).toBeUndefined()
  })
})

describe('MasterData branding', () => {
  it('does not allow a raw MasterDataInput to be assigned directly as a validated MasterData', () => {
    const raw: MasterDataInput = {
      employees: [],
      crews: [],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [truck('DT-2045', 'PT-ABC'), truck('DT-2045', 'PT-XYZ')],
      oreSamplingConfigs: [],
    }

    // @ts-expect-error MasterData is only constructible via createMasterData(); a raw MasterDataInput must not be assignable directly.
    const notValidated: MasterData = raw

    expect(notValidated).toBe(raw)
  })
})
