import type { MasterDataRemoteReader, PileAreaRemoteWriter } from '@/application/google/google-ports'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { PileAreaReference } from '@/domain/master/references'

/**
 * Write-then-verify adapter for the Apps Script Web App's `addPileArea`
 * write action (post-inspection correction §4).
 *
 * A `Content-Type: application/json` POST triggers a CORS preflight that
 * the deployed Apps Script Web App fails, so this sends a CORS-simple
 * POST instead — `Content-Type: text/plain;charset=utf-8`, never
 * `application/json`. Apps Script responses also redirect through
 * `script.googleusercontent.com`, the same behavior that makes a normal
 * `fetch` GET unusable for the master-data read (hence JSONP there); a
 * POST's response body is equally unreadable here, so this request is
 * sent with `mode: 'no-cors'` and is fire-and-forget — its (opaque)
 * response is never inspected.
 *
 * Confirmation instead comes from re-reading master data through the
 * existing JSONP `MasterDataRemoteReader` and checking the exact new row
 * is present:
 * - no matching Pile_ID at all → `APPS_SCRIPT_PILE_WRITE_UNVERIFIED`
 * - a matching Pile_ID with different Sector/Stockpile/Ore → `DUPLICATE_PILE_ID`
 * - an exact match → success
 *
 * The caller never activates/selects the new Pile locally before this
 * verification succeeds.
 */
export class AppsScriptPileAreaWriter implements PileAreaRemoteWriter {
  private readonly endpoint: string
  private readonly masterDataReader: MasterDataRemoteReader

  constructor(endpoint: string, masterDataReader: MasterDataRemoteReader) {
    this.endpoint = endpoint
    this.masterDataReader = masterDataReader
  }

  async addPileArea(pileArea: PileAreaReference): Promise<Result<void, DomainError>> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'addPileArea',
          sectorCode: pileArea.sectorCode,
          stockpileCode: pileArea.stockpileCode,
          pileId: pileArea.pileId,
          oreCode: pileArea.oreCode,
        }),
      })
    } catch {
      return err(unavailable())
    }

    const verifyResult = await this.masterDataReader.readMasterData()
    if (!verifyResult.ok) return err(unverified())

    const matches = verifyResult.value.pileAreas.filter((row) => row.pileId === pileArea.pileId)
    if (matches.length === 0) return err(unverified())

    const exactMatch = matches.some(
      (row) =>
        row.sectorCode === pileArea.sectorCode &&
        row.stockpileCode === pileArea.stockpileCode &&
        row.oreCode === pileArea.oreCode,
    )
    if (!exactMatch) {
      return err({
        code: 'DUPLICATE_PILE_ID',
        message: `Pile_ID ${pileArea.pileId} exists remotely with conflicting fields`,
      })
    }

    return ok(undefined)
  }
}

function unavailable(): DomainError {
  return { code: 'APPS_SCRIPT_UNAVAILABLE', message: 'Apps Script addPileArea request failed' }
}

function unverified(): DomainError {
  return {
    code: 'APPS_SCRIPT_PILE_WRITE_UNVERIFIED',
    message: 'Could not verify the new Pile_Areas row against Apps Script master data',
  }
}
