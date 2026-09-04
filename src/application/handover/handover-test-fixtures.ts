import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'
import type { Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { HandoverImportStore, HandoverImportStoreError } from './handover-import-store'

export const VALID_APP_DATA = { FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 1, Shift_ID: 'SHIFT-PREV-1' }
export const VALID_SHIFT_INFO = {
  Shift_ID: 'SHIFT-PREV-1',
  Date: '2026-09-03',
  Shift: 'D',
  Sector: 'BR1',
  Location: 'HOUSE-1',
}

export function baseHandoverWorkbook(overrides: Partial<RawHandoverWorkbook> = {}): RawHandoverWorkbook {
  return {
    appData: VALID_APP_DATA,
    shiftInfo: VALID_SHIFT_INFO,
    pendingSample: [],
    samplePosition: [],
    ...overrides,
  }
}

/**
 * In-memory fake satisfying the (deliberately read-only) HandoverImportStore
 * port, not imported by any production module. `markImported` is a
 * test-only setup helper — it is not part of the port, mirroring how the
 * real durable write only ever happens atomically inside
 * `LocalOperationalStore.initializeShiftWorkspace`, never standalone.
 */
export class FakeHandoverImportStore implements HandoverImportStore {
  private readonly imported = new Set<string>()

  async hasImportedFingerprint(fingerprint: string): Promise<Result<boolean, HandoverImportStoreError>> {
    return ok(this.imported.has(fingerprint))
  }

  /** Test-only setup helper — simulates a fingerprint already durably recorded by a prior atomic workspace init. */
  markImported(fingerprint: string): void {
    this.imported.add(fingerprint)
  }
}
