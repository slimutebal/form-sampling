import { LOCAL_DATABASE_SCHEMA_VERSION } from './database'
import type { HaulageTransactionRecord, ProductionRecordRecord, SamplePositionRecord, ShiftSummarySyncRecord, ShiftWorkspaceRecord } from './records'

export const WORKSPACE_BACKUP_FORMAT = 'QPS_WORKSPACE_BACKUP'
export const WORKSPACE_BACKUP_VERSION = 1

type PortableValue = null | boolean | number | string | readonly PortableValue[] | { readonly [key: string]: PortableValue }

/**
 * These are the only optional persisted-domain properties whose factory or
 * UI may materialize an own property with the value `undefined`. JSON has no
 * undefined representation, and for these TypeScript optional fields an
 * absent property is semantically identical. All other undefined values are
 * rejected so unknown persisted data is never silently dropped.
 */
const OMITTABLE_UNDEFINED_OPTIONAL_FIELDS = new Set([
  'freshPileStartPosition', // Pile, including legacy Piles
  'destinationPileId', 'excaCode', // FrontDefinition
  'sampleInHouse', 'continuationFromBatch', // PileRegistrationDraft
  'level', 'jobCode', // Master-data reference snapshots
  'dispatcherEmployeeId', // delivered SamplePosition
])

export interface WorkspaceBackupData {
  readonly workspace: ShiftWorkspaceRecord
  readonly haulageTransactions: readonly HaulageTransactionRecord[]
  readonly samplePositions: readonly SamplePositionRecord[]
  readonly productionRecords: readonly ProductionRecordRecord[]
  /** The per-shift outbox row; explicitly null when none exists. */
  readonly shiftSummarySync: ShiftSummarySyncRecord | null
}

export interface WorkspaceBackupEnvelope {
  readonly format: typeof WORKSPACE_BACKUP_FORMAT
  readonly formatVersion: typeof WORKSPACE_BACKUP_VERSION
  readonly schemaVersion: typeof LOCAL_DATABASE_SCHEMA_VERSION
  readonly createdAt: Date
  readonly scope: 'SINGLE_SHIFT_WORKSPACE'
  readonly workspaceId: string
  readonly workspaceIdentity: {
    readonly date: string
    readonly shiftCode: string
    readonly sectorCode: string
    readonly samplingHouseCode: string
    readonly checkerStatus: 'RECORDED' | 'NOT_RECORDED'
  }
  readonly data: WorkspaceBackupData
  /** `importHistory` and `masterDataCache` are deliberately excluded: neither has safe per-workspace ownership. */
  readonly exclusions: readonly ('IMPORT_HISTORY_OWNERSHIP_AMBIGUOUS' | 'MASTER_DATA_CACHE_NOT_WORKSPACE_OWNED')[]
}

export interface WorkspaceBackupPreview {
  readonly workspaceId: string
  readonly identity: WorkspaceBackupEnvelope['workspaceIdentity']
  readonly createdAt: Date
  readonly formatVersion: number
  readonly schemaVersion: number
  readonly piles: number
  readonly haulageTransactions: number
  readonly samplePositions: number
  readonly productionRecords: number
  readonly correctionAuditEntries: number
  readonly hasShiftSummarySync: boolean
  readonly exclusions: readonly string[]
}

export class WorkspaceBackupValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new WorkspaceBackupValidationError(code, message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Encodes Date values explicitly and rejects values JSON would silently lose
 * (undefined, binary, non-finite numbers, class instances). This keeps a
 * portable export faithful to the Dexie snapshot rather than best-effort.
 */
function encode(value: unknown, path = '$'): PortableValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('BACKUP_UNSUPPORTED_VALUE', `${path} contains a non-finite number`)
    return value
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail('BACKUP_UNSUPPORTED_VALUE', `${path} contains an invalid Date`)
    return { $qpsBackupType: 'Date', value: value.toISOString() }
  }
  if (Array.isArray(value)) return value.map((entry, index) => encode(entry, `${path}[${index}]`))
  if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('BACKUP_UNSUPPORTED_VALUE', `${path} is not a portable plain value`)
  }
  if ('$qpsBackupType' in value) fail('BACKUP_UNSUPPORTED_VALUE', `${path} uses a reserved backup property`)
  const result: Record<string, PortableValue> = {}
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) {
      if (OMITTABLE_UNDEFINED_OPTIONAL_FIELDS.has(key)) continue
      fail('BACKUP_UNSUPPORTED_VALUE', `${path}.${key} is undefined`)
    }
    result[key] = encode(value[key], `${path}.${key}`)
  }
  return result
}

function decode(value: unknown, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value.map((entry, index) => decode(entry, `${path}[${index}]`))
  if (!isObject(value)) fail('BACKUP_INVALID_JSON_VALUE', `${path} is not a JSON value`)
  if (value.$qpsBackupType === 'Date') {
    if (Object.keys(value).length !== 2 || typeof value.value !== 'string') fail('BACKUP_INVALID_DATE', `${path} has an invalid Date encoding`)
    const date = new Date(value.value)
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value.value) fail('BACKUP_INVALID_DATE', `${path} has an invalid Date`)
    return date
  }
  if ('$qpsBackupType' in value) fail('BACKUP_INVALID_JSON_VALUE', `${path} uses an unknown typed value`)
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) result[key] = decode(entry, `${path}.${key}`)
  return result
}

export function stringifyWorkspaceBackup(backup: WorkspaceBackupEnvelope): string {
  validateWorkspaceBackup(backup)
  return JSON.stringify(encode(backup), null, 2)
}

export function parseWorkspaceBackup(text: string): WorkspaceBackupEnvelope {
  if (text.length > 50 * 1024 * 1024) fail('BACKUP_FILE_TOO_LARGE', 'Backup file exceeds the 50 MB safety limit')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { fail('BACKUP_INVALID_JSON', 'Backup file is not valid JSON') }
  const backup = decode(parsed) as WorkspaceBackupEnvelope
  validateWorkspaceBackup(backup)
  return backup
}

function distinctIds(rows: readonly { readonly id: unknown }[], name: string): void {
  const ids = new Set<string>()
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id) fail('BACKUP_INVALID_ENTITY', `${name} has an invalid id`)
    if (ids.has(row.id)) fail('BACKUP_DUPLICATE_ID', `${name} has duplicate id ${row.id}`)
    ids.add(row.id)
  }
}

/** Validates identity, ownership and the persistent relationships without recreating domain data. */
export function validateWorkspaceBackup(backup: WorkspaceBackupEnvelope): WorkspaceBackupPreview {
  if (!isObject(backup) || backup.format !== WORKSPACE_BACKUP_FORMAT) fail('BACKUP_FORMAT_UNSUPPORTED', 'Unsupported backup format')
  if (backup.formatVersion !== WORKSPACE_BACKUP_VERSION) fail('BACKUP_VERSION_UNSUPPORTED', 'Unsupported backup format version')
  if (backup.schemaVersion !== LOCAL_DATABASE_SCHEMA_VERSION) fail('BACKUP_SCHEMA_UNSUPPORTED', 'Backup schema version is not supported by this application')
  if (!(backup.createdAt instanceof Date) || Number.isNaN(backup.createdAt.getTime())) fail('BACKUP_INVALID_METADATA', 'Backup creation time is invalid')
  if (backup.scope !== 'SINGLE_SHIFT_WORKSPACE' || typeof backup.workspaceId !== 'string' || !isObject(backup.data)) fail('BACKUP_INVALID_METADATA', 'Backup scope or workspace id is invalid')
  if (!Object.prototype.hasOwnProperty.call(backup.data, 'shiftSummarySync')) fail('BACKUP_INVALID_STRUCTURE', 'Backup must explicitly contain shiftSummarySync as a row or null')
  const { workspace, haulageTransactions, samplePositions, productionRecords, shiftSummarySync } = backup.data
  if (!workspace || workspace.shiftId !== backup.workspaceId || workspace.shift?.id !== backup.workspaceId) fail('BACKUP_WORKSPACE_MISMATCH', 'Workspace identity does not match its stored snapshot')
  if (!Array.isArray(workspace.piles) || !Array.isArray(haulageTransactions) || !Array.isArray(samplePositions) || !Array.isArray(productionRecords)) fail('BACKUP_INVALID_STRUCTURE', 'Backup collections are invalid')
  const identity = backup.workspaceIdentity
  if (!identity || (identity.checkerStatus !== 'RECORDED' && identity.checkerStatus !== 'NOT_RECORDED') || identity.date !== String(workspace.shift.date) || identity.shiftCode !== String(workspace.shift.shiftCode) || identity.sectorCode !== String(workspace.shift.sectorCode) || identity.samplingHouseCode !== String(workspace.shift.samplingHouseCode)) fail('BACKUP_IDENTITY_MISMATCH', 'Backup display identity does not match its workspace')
  if (!Array.isArray(backup.exclusions)) fail('BACKUP_INVALID_STRUCTURE', 'Backup exclusions are invalid')
  distinctIds(haulageTransactions, 'haulageTransactions'); distinctIds(samplePositions, 'samplePositions'); distinctIds(productionRecords, 'productionRecords')
  const pileIds = new Set(workspace.piles.map((pile) => String(pile.id)))
  const haulageIds = new Set<string>()
  for (const row of haulageTransactions) {
    if (row.shiftId !== backup.workspaceId || row.transaction?.shiftId !== backup.workspaceId || row.pileId !== row.transaction?.pileId || row.id !== row.transaction?.id || !pileIds.has(String(row.pileId))) fail('BACKUP_BROKEN_REFERENCE', 'A haulage transaction does not belong to this workspace')
    haulageIds.add(String(row.id))
  }
  for (const row of samplePositions) {
    if (row.shiftId !== backup.workspaceId || row.samplePosition?.shiftId !== backup.workspaceId || row.pileId !== row.samplePosition?.pileId || row.id !== row.samplePosition?.id || !pileIds.has(String(row.pileId))) fail('BACKUP_BROKEN_REFERENCE', 'A sample position does not belong to this workspace')
  }
  let corrections = 0
  for (const row of productionRecords) {
    const transaction = row.productionRecord?.transaction
    if (row.shiftId !== backup.workspaceId || transaction?.shiftId !== backup.workspaceId || row.pileId !== transaction?.pileId || row.id !== transaction?.id || !haulageIds.has(String(row.id)) || !pileIds.has(String(row.pileId))) fail('BACKUP_BROKEN_REFERENCE', 'A production record does not reference a workspace haulage transaction')
    const history = row.productionRecord?.audit?.corrections
    if (history !== undefined && !Array.isArray(history)) fail('BACKUP_INVALID_ENTITY', 'Production correction history is invalid')
    corrections += history?.length ?? 0
  }
  if (shiftSummarySync !== null && (!isObject(shiftSummarySync) || shiftSummarySync.shiftId !== backup.workspaceId)) fail('BACKUP_BROKEN_REFERENCE', 'Shift summary outbox does not belong to this workspace')
  return { workspaceId: backup.workspaceId, identity, createdAt: backup.createdAt, formatVersion: backup.formatVersion, schemaVersion: backup.schemaVersion, piles: workspace.piles.length, haulageTransactions: haulageTransactions.length, samplePositions: samplePositions.length, productionRecords: productionRecords.length, correctionAuditEntries: corrections, hasShiftSummarySync: Boolean(shiftSummarySync), exclusions: backup.exclusions ?? [] }
}

export function createWorkspaceBackupEnvelope(data: WorkspaceBackupData): WorkspaceBackupEnvelope {
  const checkerStatus = data.workspace.manpower?.some((assignment) => assignment.jobDeskCode === 'Checker') ? 'RECORDED' : 'NOT_RECORDED'
  const backup: WorkspaceBackupEnvelope = {
    format: WORKSPACE_BACKUP_FORMAT, formatVersion: WORKSPACE_BACKUP_VERSION, schemaVersion: LOCAL_DATABASE_SCHEMA_VERSION,
    createdAt: new Date(), scope: 'SINGLE_SHIFT_WORKSPACE', workspaceId: String(data.workspace.shiftId),
    workspaceIdentity: { date: String(data.workspace.shift.date), shiftCode: String(data.workspace.shift.shiftCode), sectorCode: String(data.workspace.shift.sectorCode), samplingHouseCode: String(data.workspace.shift.samplingHouseCode), checkerStatus },
    data: { ...data, shiftSummarySync: data.shiftSummarySync ?? null }, exclusions: ['IMPORT_HISTORY_OWNERSHIP_AMBIGUOUS', 'MASTER_DATA_CACHE_NOT_WORKSPACE_OWNED'],
  }
  validateWorkspaceBackup(backup)
  return backup
}

export function workspaceBackupFilename(backup: WorkspaceBackupEnvelope): string {
  const safe = [backup.workspaceIdentity.date, backup.workspaceIdentity.shiftCode, backup.workspaceIdentity.sectorCode, backup.workspaceIdentity.samplingHouseCode].join('-').replace(/[^A-Za-z0-9_-]/g, '_')
  return `qps-workspace-${safe}-${backup.workspaceId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`
}
