import { describe, expect, it } from 'vitest'
import type { GoogleSheetsTransport, GoogleSheetsValueRange } from '@/application/google/google-ports'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import { MasterDataSheetReader, parseMasterDataFromRanges, type RawMasterDataRanges } from './master-data-sheet-reader'

type GoogleRows = readonly (readonly unknown[])[]

function validRanges(): RawMasterDataRanges {
  return {
    employees: [
      ['Employee_ID', 'Name'],
      ['12345', 'John Doe'],
      ['', '', ''], // trailing blank row — ignored
    ],
    crews: [
      ['Crew_ID', 'Name', 'Job'],
      ['CREW-A', 'Crew A', 'Sampler'],
      ['CREW-B', 'Crew B', ''], // blank Job is allowed
    ],
    sectors: [['Sector_Code'], ['BR1'], ['DS']],
    samplingHouses: [
      ['Sector_Code', 'Sampling_House_Code'],
      ['BR1', 'SH_01'],
      ['DS', 'SH_01'], // same house code, different sector — allowed
    ],
    pileAreas: [
      ['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore'],
      ['BR1', 'STOCK-A', 'PILE-1', 'SAP'],
      ['BR1', 'STOCK-A', 'PILE-2', 'SAP'], // repeated stockpile — allowed
    ],
    haulers: [
      ['Hauler_Code', 'Name'],
      ['PT-ABC', 'PT ABC Transport'],
    ],
    trucks: [
      ['Truck_ID', 'Hauler_Code'],
      ['DT-2045', 'PT-ABC'],
    ],
    oreSamplingConfigs: [
      ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
      ['SAP', 2, 20, 2],
      ['LIM', 5, 100, 10],
    ],
  }
}

describe('parseMasterDataFromRanges — happy path', () => {
  it('maps a valid, complete production-shaped dataset into every MasterData collection', () => {
    const result = parseMasterDataFromRanges(validRanges())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.employees).toEqual([{ id: '12345', name: 'John Doe' }])
    expect(result.value.crews).toEqual([
      { code: 'CREW-A', name: 'Crew A', jobCode: 'Sampler' },
      { code: 'CREW-B', name: 'Crew B', jobCode: undefined },
    ])
    expect(result.value.sectors).toEqual([{ code: 'BR1' }, { code: 'DS' }])
    expect(result.value.locations).toEqual([])
    expect(result.value.samplingHouses).toEqual([
      { sectorCode: 'BR1', code: 'SH_01' },
      { sectorCode: 'DS', code: 'SH_01' },
    ])
    expect(result.value.pileAreas).toEqual([
      { sectorCode: 'BR1', stockpileCode: 'STOCK-A', pileId: 'PILE-1', oreCode: 'SAP' },
      { sectorCode: 'BR1', stockpileCode: 'STOCK-A', pileId: 'PILE-2', oreCode: 'SAP' },
    ])
    expect(result.value.haulers).toEqual([{ code: 'PT-ABC', name: 'PT ABC Transport' }])
    expect(result.value.trucks).toEqual([{ id: 'DT-2045', haulerCode: 'PT-ABC' }])
    expect(result.value.oreSamplingConfigs).toHaveLength(2)
  })

  it('never produces a Locations collection other than an empty array', () => {
    const result = parseMasterDataFromRanges(validRanges())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.locations).toEqual([])
  })
})

describe('parseMasterDataFromRanges — header validation', () => {
  it('requires the exact expected header row', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({ ...ranges, sectors: [['Wrong_Header'], ['BR1']] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_REQUIRED_HEADER_MISSING')
  })

  it('rejects a sheet with no header row at all', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({ ...ranges, employees: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_REQUIRED_HEADER_MISSING')
  })
})

describe('parseMasterDataFromRanges — row validation', () => {
  it('ignores a completely blank trailing row', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      sectors: [['Sector_Code'], ['BR1'], ['DS'], ['']],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sectors).toEqual([{ code: 'BR1' }, { code: 'DS' }])
  })

  it('rejects a partially populated row rather than silently skipping it', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      samplingHouses: [
        ['Sector_Code', 'Sampling_House_Code'],
        ['BR1', ''],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
  })

  it('rejects a malformed Employee_ID', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      employees: [
        ['Employee_ID', 'Name'],
        ['   ', 'Blank Id'],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
  })

  it('rejects a blank Sampling_Interval', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      oreSamplingConfigs: [
        ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
        ['SAP', undefined, 20, 2],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
  })

  it('rejects a non-integer Batch_Size using the existing domain constructor rule', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      oreSamplingConfigs: [
        ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
        ['SAP', 2, 20.5, 2],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
    expect(result.error.message).toContain('INVALID_BATCH_SIZE')
  })

  it('rejects Sampling_Interval/Batch_Size/Packing supplied as a formatted string rather than an unformatted number', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      oreSamplingConfigs: [
        ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
        ['SAP', '2', 20, 2],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_MASTER_ROW_INVALID')
  })
})

describe('parseMasterDataFromRanges — createMasterData validation is never bypassed', () => {
  it('rejects a duplicate Employee_ID via createMasterData', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      employees: [
        ['Employee_ID', 'Name'],
        ['12345', 'John Doe'],
        ['12345', 'Jane Doe'],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_EMPLOYEE_ID')
  })

  it('rejects a duplicate Pile_ID via createMasterData', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      pileAreas: [
        ['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore'],
        ['BR1', 'STOCK-A', 'PILE-1', 'SAP'],
        ['BR1', 'STOCK-B', 'PILE-1', 'SAP'],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_PILE_AREA_PILE_ID')
  })

  it('rejects a duplicate Ore via createMasterData', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      oreSamplingConfigs: [
        ['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing'],
        ['SAP', 2, 20, 2],
        ['SAP', 5, 100, 10],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_ORE_CODE')
  })

  it('rejects an orphan Truck Hauler_Code via createMasterData', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      trucks: [
        ['Truck_ID', 'Hauler_Code'],
        ['DT-2045', 'PT-UNKNOWN'],
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MASTER_TRUCK_HAULER_NOT_FOUND')
  })

  it('accepts an empty (but header-present) collection where the domain allows it', () => {
    const ranges = validRanges()
    const result = parseMasterDataFromRanges({
      ...ranges,
      crews: [['Crew_ID', 'Name', 'Job']],
      haulers: [['Hauler_Code', 'Name']],
      trucks: [['Truck_ID', 'Hauler_Code']],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.crews).toEqual([])
    expect(result.value.haulers).toEqual([])
    expect(result.value.trucks).toEqual([])
  })
})

function fakeTransport(ranges: RawMasterDataRanges): { transport: GoogleSheetsTransport; requestedRanges: string[] } {
  const requestedRanges: string[] = []
  const byRange: Record<string, GoogleRows> = {
    'Employees!A:B': ranges.employees,
    'Crews!A:C': ranges.crews,
    'Sectors!A:A': ranges.sectors,
    'Sampling_Houses!A:B': ranges.samplingHouses,
    'Pile_Areas!A:D': ranges.pileAreas,
    'Haulers!A:B': ranges.haulers,
    'Trucks!A:B': ranges.trucks,
    'Ore_Sampling_Config!A:D': ranges.oreSamplingConfigs,
  }
  const transport: GoogleSheetsTransport = {
    getValues: async (_spreadsheetId, range): Promise<Result<GoogleSheetsValueRange, DomainError>> => {
      requestedRanges.push(range)
      const values = byRange[range]
      if (values === undefined) {
        return err({ code: 'GOOGLE_REQUEST_FAILED', message: `unexpected range requested in test: ${range}` })
      }
      return ok({ range, values })
    },
    updateValues: async () => ok(undefined),
    appendValues: async () => ok(undefined),
  }
  return { transport, requestedRanges }
}

describe('MasterDataSheetReader', () => {
  it('composes the transport and the parser into a validated MasterData snapshot', async () => {
    const { transport } = fakeTransport(validRanges())
    const reader = new MasterDataSheetReader({ transport, config: { spreadsheetId: 'SHEET-1' } })

    const result = await reader.readMasterData()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sectors).toEqual([{ code: 'BR1' }, { code: 'DS' }])
  })

  it('never requests a Locations range', async () => {
    const { transport, requestedRanges } = fakeTransport(validRanges())
    const reader = new MasterDataSheetReader({ transport, config: { spreadsheetId: 'SHEET-1' } })

    await reader.readMasterData()

    expect(requestedRanges.some((range) => range.toLowerCase().includes('location'))).toBe(false)
  })

  it('propagates a transport failure without attempting to parse', async () => {
    const transport: GoogleSheetsTransport = {
      getValues: async () => err({ code: 'GOOGLE_REQUEST_FAILED', message: 'network down' }),
      updateValues: async () => ok(undefined),
      appendValues: async () => ok(undefined),
    }
    const reader = new MasterDataSheetReader({ transport, config: { spreadsheetId: 'SHEET-1' } })

    const result = await reader.readMasterData()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')
  })
})
