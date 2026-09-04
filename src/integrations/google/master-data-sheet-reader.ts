import type { GoogleSheetsTransport, MasterDataRemoteReader } from '@/application/google/google-ports'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode } from '@/domain/common/codes'
import { parseEmployeeId, parsePileId, parseTruckId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import { createMasterData, type MasterData, type MasterDataInput } from '@/domain/master/master-data'
import { parseCrewCode, parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import {
  createCrewReference,
  createEmployeeReference,
  createHaulerReference,
  createPileAreaReference,
  createSamplingHouseReference,
  createSectorReference,
  createTruckReference,
  type CrewReference,
  type EmployeeReference,
  type HaulerReference,
  type PileAreaReference,
  type SamplingHouseReference,
  type SectorReference,
  type TruckReference,
} from '@/domain/master/references'
import {
  createOreSamplingConfig,
  parseBatchSize,
  parsePackingConfigValue,
  parseSamplingInterval,
  type OreSamplingConfig,
} from '@/domain/master/sampling-config'
import {
  cellText,
  GOOGLE_MASTER_HEADERS,
  GOOGLE_MASTER_SHEET_RANGES,
  isRowBlank,
  requireExactHeaderRow,
  type GoogleSheetsConfig,
} from './google-sheet-contract'

/**
 * Google Sheets parsing/schema adaptation for the Phase 16 master-data
 * contract, treating every remote row as untrusted (rule §11: the
 * production sheet's admin-side dropdowns/duplicate protection are UX
 * safeguards only, never trusted here). Every dataset is required to
 * present its exact header row (§4) — a completely blank trailing row is
 * ignored, but any row with some but not all required cells populated is
 * rejected outright (`GOOGLE_MASTER_ROW_INVALID`) rather than silently
 * skipped or guessed at.
 */

type GoogleRow = readonly unknown[]
type GoogleRows = readonly GoogleRow[]

export interface RawMasterDataRanges {
  readonly employees: GoogleRows
  readonly crews: GoogleRows
  readonly sectors: GoogleRows
  readonly samplingHouses: GoogleRows
  readonly pileAreas: GoogleRows
  readonly haulers: GoogleRows
  readonly trucks: GoogleRows
  readonly oreSamplingConfigs: GoogleRows
}

function rowError(sheetLabel: string, rowIndex: number, cause: DomainError): DomainError {
  return {
    code: 'GOOGLE_MASTER_ROW_INVALID',
    message: `${sheetLabel} row ${rowIndex + 2}: ${cause.code} (${cause.message})`,
  }
}

function requiredCellsMissing(sheetLabel: string, rowIndex: number): DomainError {
  return {
    code: 'GOOGLE_MASTER_ROW_INVALID',
    message: `${sheetLabel} row ${rowIndex + 2}: every required column must be populated`,
  }
}

/** Reads a Google Sheets `UNFORMATTED_VALUE` numeric cell — never coerces a string into a number (rule §4/§6). */
function numericCell(row: GoogleRow, columnIndex: number): number | undefined {
  const value = row[columnIndex]
  return typeof value === 'number' ? value : undefined
}

function parseSectorRows(dataRows: GoogleRows): Result<readonly SectorReference[], DomainError> {
  const sectors: SectorReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 1)) continue
    const code = parseSectorCode(cellText(row[0]))
    if (!code.ok) return { ok: false, error: rowError('Sectors', index, code.error) }
    sectors.push(createSectorReference(code.value))
  }
  return ok(sectors)
}

function parseEmployeeRows(dataRows: GoogleRows): Result<readonly EmployeeReference[], DomainError> {
  const employees: EmployeeReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 2)) continue
    const idText = cellText(row[0])
    const name = cellText(row[1])
    if (idText.length === 0 || name.length === 0) {
      return { ok: false, error: requiredCellsMissing('Employees', index) }
    }
    const id = parseEmployeeId(idText)
    if (!id.ok) return { ok: false, error: rowError('Employees', index, id.error) }
    employees.push(createEmployeeReference(id.value, name))
  }
  return ok(employees)
}

function parseCrewRows(dataRows: GoogleRows): Result<readonly CrewReference[], DomainError> {
  const crews: CrewReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 3)) continue
    const idText = cellText(row[0])
    const name = cellText(row[1])
    const jobText = cellText(row[2])
    // Job (row[2]) is deliberately excluded from the required-cell check —
    // it may be blank (Phase 16 §2A) — but Crew_ID and Name are required.
    if (idText.length === 0 || name.length === 0) {
      return { ok: false, error: requiredCellsMissing('Crews', index) }
    }
    const code = parseCrewCode(idText)
    if (!code.ok) return { ok: false, error: rowError('Crews', index, code.error) }
    crews.push(createCrewReference(code.value, name, jobText.length > 0 ? jobText : undefined))
  }
  return ok(crews)
}

function parseSamplingHouseRows(dataRows: GoogleRows): Result<readonly SamplingHouseReference[], DomainError> {
  const samplingHouses: SamplingHouseReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 2)) continue
    const sectorText = cellText(row[0])
    const houseText = cellText(row[1])
    if (sectorText.length === 0 || houseText.length === 0) {
      return { ok: false, error: requiredCellsMissing('Sampling_Houses', index) }
    }
    const sectorCode = parseSectorCode(sectorText)
    if (!sectorCode.ok) return { ok: false, error: rowError('Sampling_Houses', index, sectorCode.error) }
    const houseCode = parseSamplingHouseCode(houseText)
    if (!houseCode.ok) return { ok: false, error: rowError('Sampling_Houses', index, houseCode.error) }
    samplingHouses.push(createSamplingHouseReference(sectorCode.value, houseCode.value))
  }
  return ok(samplingHouses)
}

function parsePileAreaRows(dataRows: GoogleRows): Result<readonly PileAreaReference[], DomainError> {
  const pileAreas: PileAreaReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 4)) continue
    const sectorText = cellText(row[0])
    const stockpileText = cellText(row[1])
    const pileIdText = cellText(row[2])
    const oreText = cellText(row[3])
    if (sectorText.length === 0 || stockpileText.length === 0 || pileIdText.length === 0 || oreText.length === 0) {
      return { ok: false, error: requiredCellsMissing('Pile_Areas', index) }
    }
    const sectorCode = parseSectorCode(sectorText)
    if (!sectorCode.ok) return { ok: false, error: rowError('Pile_Areas', index, sectorCode.error) }
    const stockpileCode = parsePileAreaCode(stockpileText)
    if (!stockpileCode.ok) return { ok: false, error: rowError('Pile_Areas', index, stockpileCode.error) }
    const pileId = parsePileId(pileIdText)
    if (!pileId.ok) return { ok: false, error: rowError('Pile_Areas', index, pileId.error) }
    const oreCode = parseOreCode(oreText)
    if (!oreCode.ok) return { ok: false, error: rowError('Pile_Areas', index, oreCode.error) }
    pileAreas.push(createPileAreaReference(sectorCode.value, stockpileCode.value, pileId.value, oreCode.value))
  }
  return ok(pileAreas)
}

function parseHaulerRows(dataRows: GoogleRows): Result<readonly HaulerReference[], DomainError> {
  const haulers: HaulerReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 2)) continue
    const codeText = cellText(row[0])
    const name = cellText(row[1])
    if (codeText.length === 0 || name.length === 0) {
      return { ok: false, error: requiredCellsMissing('Haulers', index) }
    }
    const code = parseHaulerCode(codeText)
    if (!code.ok) return { ok: false, error: rowError('Haulers', index, code.error) }
    haulers.push(createHaulerReference(code.value, name))
  }
  return ok(haulers)
}

function parseTruckRows(dataRows: GoogleRows): Result<readonly TruckReference[], DomainError> {
  const trucks: TruckReference[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 2)) continue
    const idText = cellText(row[0])
    const haulerText = cellText(row[1])
    if (idText.length === 0 || haulerText.length === 0) {
      return { ok: false, error: requiredCellsMissing('Trucks', index) }
    }
    const id = parseTruckId(idText)
    if (!id.ok) return { ok: false, error: rowError('Trucks', index, id.error) }
    const haulerCode = parseHaulerCode(haulerText)
    if (!haulerCode.ok) return { ok: false, error: rowError('Trucks', index, haulerCode.error) }
    trucks.push(createTruckReference(id.value, haulerCode.value))
  }
  return ok(trucks)
}

function parseOreSamplingConfigRows(dataRows: GoogleRows): Result<readonly OreSamplingConfig[], DomainError> {
  const configs: OreSamplingConfig[] = []
  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]
    if (isRowBlank(row, 4)) continue
    const oreText = cellText(row[0])
    const interval = numericCell(row, 1)
    const batchSize = numericCell(row, 2)
    const packing = numericCell(row, 3)
    if (oreText.length === 0 || interval === undefined || batchSize === undefined || packing === undefined) {
      return { ok: false, error: requiredCellsMissing('Ore_Sampling_Config', index) }
    }
    const oreCode = parseOreCode(oreText)
    if (!oreCode.ok) return { ok: false, error: rowError('Ore_Sampling_Config', index, oreCode.error) }
    const parsedInterval = parseSamplingInterval(interval)
    if (!parsedInterval.ok) return { ok: false, error: rowError('Ore_Sampling_Config', index, parsedInterval.error) }
    const parsedBatchSize = parseBatchSize(batchSize)
    if (!parsedBatchSize.ok) return { ok: false, error: rowError('Ore_Sampling_Config', index, parsedBatchSize.error) }
    const parsedPacking = parsePackingConfigValue(packing)
    if (!parsedPacking.ok) return { ok: false, error: rowError('Ore_Sampling_Config', index, parsedPacking.error) }
    configs.push(
      createOreSamplingConfig({
        oreCode: oreCode.value,
        interval: parsedInterval.value,
        batchSize: parsedBatchSize.value,
        packing: parsedPacking.value,
      }),
    )
  }
  return ok(configs)
}

/**
 * Pure parsing entry point: turns the 8 raw Google ranges into a
 * validated `MasterData` snapshot. Always finishes by passing every
 * collection through `createMasterData()` (rule §5/§3) — duplicate and
 * cross-collection referential checks are never reimplemented here. No
 * `Locations` range is read or produced — `locations` is always `[]`
 * (Phase 16 §2E: no such Google sheet exists).
 */
export function parseMasterDataFromRanges(ranges: RawMasterDataRanges): Result<MasterData, DomainError> {
  const employeesHeader = requireExactHeaderRow(ranges.employees, GOOGLE_MASTER_HEADERS.employees, 'Employees')
  if (!employeesHeader.ok) return employeesHeader
  const employees = parseEmployeeRows(employeesHeader.value)
  if (!employees.ok) return employees

  const crewsHeader = requireExactHeaderRow(ranges.crews, GOOGLE_MASTER_HEADERS.crews, 'Crews')
  if (!crewsHeader.ok) return crewsHeader
  const crews = parseCrewRows(crewsHeader.value)
  if (!crews.ok) return crews

  const sectorsHeader = requireExactHeaderRow(ranges.sectors, GOOGLE_MASTER_HEADERS.sectors, 'Sectors')
  if (!sectorsHeader.ok) return sectorsHeader
  const sectors = parseSectorRows(sectorsHeader.value)
  if (!sectors.ok) return sectors

  const samplingHousesHeader = requireExactHeaderRow(
    ranges.samplingHouses,
    GOOGLE_MASTER_HEADERS.samplingHouses,
    'Sampling_Houses',
  )
  if (!samplingHousesHeader.ok) return samplingHousesHeader
  const samplingHouses = parseSamplingHouseRows(samplingHousesHeader.value)
  if (!samplingHouses.ok) return samplingHouses

  const pileAreasHeader = requireExactHeaderRow(ranges.pileAreas, GOOGLE_MASTER_HEADERS.pileAreas, 'Pile_Areas')
  if (!pileAreasHeader.ok) return pileAreasHeader
  const pileAreas = parsePileAreaRows(pileAreasHeader.value)
  if (!pileAreas.ok) return pileAreas

  const haulersHeader = requireExactHeaderRow(ranges.haulers, GOOGLE_MASTER_HEADERS.haulers, 'Haulers')
  if (!haulersHeader.ok) return haulersHeader
  const haulers = parseHaulerRows(haulersHeader.value)
  if (!haulers.ok) return haulers

  const trucksHeader = requireExactHeaderRow(ranges.trucks, GOOGLE_MASTER_HEADERS.trucks, 'Trucks')
  if (!trucksHeader.ok) return trucksHeader
  const trucks = parseTruckRows(trucksHeader.value)
  if (!trucks.ok) return trucks

  const oreSamplingConfigsHeader = requireExactHeaderRow(
    ranges.oreSamplingConfigs,
    GOOGLE_MASTER_HEADERS.oreSamplingConfigs,
    'Ore_Sampling_Config',
  )
  if (!oreSamplingConfigsHeader.ok) return oreSamplingConfigsHeader
  const oreSamplingConfigs = parseOreSamplingConfigRows(oreSamplingConfigsHeader.value)
  if (!oreSamplingConfigs.ok) return oreSamplingConfigs

  const input: MasterDataInput = {
    employees: employees.value,
    crews: crews.value,
    sectors: sectors.value,
    locations: [],
    samplingHouses: samplingHouses.value,
    pileAreas: pileAreas.value,
    haulers: haulers.value,
    trucks: trucks.value,
    oreSamplingConfigs: oreSamplingConfigs.value,
  }
  return createMasterData(input)
}

export interface MasterDataSheetReaderDeps {
  readonly transport: GoogleSheetsTransport
  readonly config: GoogleSheetsConfig
}

/**
 * Composes the transport (HTTP) with `parseMasterDataFromRanges`
 * (schema adaptation) to implement the application-owned
 * `MasterDataRemoteReader` port. Fetches every range sequentially and
 * stops at the first transport failure — it never requests a
 * `Locations` range, since none exists (Phase 16 §1).
 */
export class MasterDataSheetReader implements MasterDataRemoteReader {
  private readonly transport: GoogleSheetsTransport
  private readonly config: GoogleSheetsConfig

  constructor(deps: MasterDataSheetReaderDeps) {
    this.transport = deps.transport
    this.config = deps.config
  }

  async readMasterData(): Promise<Result<MasterData, DomainError>> {
    const employees = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.employees)
    if (!employees.ok) return employees
    const crews = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.crews)
    if (!crews.ok) return crews
    const sectors = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.sectors)
    if (!sectors.ok) return sectors
    const samplingHouses = await this.transport.getValues(
      this.config.spreadsheetId,
      GOOGLE_MASTER_SHEET_RANGES.samplingHouses,
    )
    if (!samplingHouses.ok) return samplingHouses
    const pileAreas = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.pileAreas)
    if (!pileAreas.ok) return pileAreas
    const haulers = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.haulers)
    if (!haulers.ok) return haulers
    const trucks = await this.transport.getValues(this.config.spreadsheetId, GOOGLE_MASTER_SHEET_RANGES.trucks)
    if (!trucks.ok) return trucks
    const oreSamplingConfigs = await this.transport.getValues(
      this.config.spreadsheetId,
      GOOGLE_MASTER_SHEET_RANGES.oreSamplingConfigs,
    )
    if (!oreSamplingConfigs.ok) return oreSamplingConfigs

    return parseMasterDataFromRanges({
      employees: employees.value.values,
      crews: crews.value.values,
      sectors: sectors.value.values,
      samplingHouses: samplingHouses.value.values,
      pileAreas: pileAreas.value.values,
      haulers: haulers.value.values,
      trucks: trucks.value.values,
      oreSamplingConfigs: oreSamplingConfigs.value.values,
    })
  }
}
