import type { DomainError } from '@/domain/common/result'

/** Where a master-data refresh (or the cache read that follows it) stopped. */
export type MasterDataRefreshStage =
  | 'CONFIG'
  | 'REMOTE_REQUEST'
  | 'REMOTE_PAYLOAD'
  | 'REMOTE_VALIDATION'
  | 'CACHE_WRITE'
  | 'CACHE_READ'
  | 'UNKNOWN'

/**
 * Personal-data-free detail behind a `MASTER_DATA_REMOTE_INVALID` failure.
 * Only codes, a sheet/table name and a sheet row number are ever kept —
 * never a cell value, an error `message` (which can echo one), or payload.
 */
export interface MasterDataInvalidDetail {
  readonly stage: 'REMOTE_PAYLOAD' | 'REMOTE_VALIDATION'
  readonly causeCode: string
  readonly table?: string
  readonly rowNumber?: number
}

/** A `DomainError` that may carry `MasterDataInvalidDetail`, without changing its `code`/`message`. */
export interface MasterDataRefreshError extends DomainError {
  readonly detail?: MasterDataInvalidDetail
}

/** One retained, loggable refresh failure. Safe to print: codes, stage, table and row number only. */
export interface MasterDataRefreshDiagnostic {
  readonly stage: MasterDataRefreshStage
  readonly code: string
  readonly causeCode?: string
  readonly table?: string
  readonly rowNumber?: number
  /** Additional callers that shared this single-flight request. */
  readonly joinedCallers?: number
  readonly at: string
}

const REQUEST_CODES = new Set(['APPS_SCRIPT_UNAVAILABLE', 'APPS_SCRIPT_TIMEOUT'])

/** Reads only the whitelisted structured fields of a refresh error — `message` is deliberately never copied. */
export function describeMasterDataRefreshFailure(
  error: DomainError,
  stage: MasterDataRefreshStage | undefined,
  at: Date,
): MasterDataRefreshDiagnostic {
  const detail = (error as MasterDataRefreshError).detail
  return {
    stage: stage ?? detail?.stage ?? stageForCode(error.code),
    code: error.code,
    ...(detail ? { causeCode: detail.causeCode } : {}),
    ...(detail?.table !== undefined ? { table: detail.table } : {}),
    ...(detail?.rowNumber !== undefined ? { rowNumber: detail.rowNumber } : {}),
    at: at.toISOString(),
  }
}

function stageForCode(code: string): MasterDataRefreshStage {
  if (code === 'GOOGLE_CONFIG_UNAVAILABLE') return 'CONFIG'
  if (REQUEST_CODES.has(code)) return 'REMOTE_REQUEST'
  if (code === 'MASTER_DATA_REMOTE_INVALID') return 'REMOTE_VALIDATION'
  return 'UNKNOWN'
}
