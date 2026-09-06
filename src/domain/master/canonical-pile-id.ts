import { parseOreCode, parseSectorCode, type OreCode, type SectorCode } from '../common/codes'
import type { DomainError, Result } from '../common/result'
import { err, ok } from '../common/result'
import { parsePileAreaCode, type PileAreaCode } from './master-codes'

/** Sector/Stockpile/Ore derived for a brand-new Pile_ID (post-inspection correction §3). */
export interface DerivedPileGrammar {
  readonly sectorCode: SectorCode
  readonly stockpileCode: PileAreaCode
  readonly oreCode: OreCode
}

const DS_C_FAMILY = /^DS-C(\d+)_(L|S)(\d+)$/
const LIM_STOCKPILE_FAMILY = /^L(\d+)_(S)?(\d+)$/
const SAP_STOCKPILE_FAMILY = /^S(\d+)_(L)?(\d+)$/

/**
 * Derives Sector/Stockpile/Ore for a brand-new Pile_ID from its confirmed
 * canonical naming grammar — never asked of the operator for these
 * patterns, and never guessed for a pattern outside them. Only consulted
 * when a Pile_ID does not already exist in MasterData; an existing/legacy
 * Pile_ID is always resolved by exact master lookup instead, regardless
 * of whether its name happens to match or contradict this grammar.
 *
 * Confirmed families:
 * - LIM stockpile:  `L<n>_<nn>` → Stockpile `LS_<n>` / Ore LIM;
 *                    `L<n>_S<nn>` → Stockpile `LS_<n>` / Ore SAP.
 * - SAP stockpile:  `S<n>_<nn>` → Stockpile `SS_<n>` / Ore SAP;
 *                    `S<n>_L<nn>` → Stockpile `SS_<n>` / Ore LIM.
 * - DS-C stockpile: `DS-C<n>_L<nn>` → Sector DS, Stockpile `DS-C_<n>` / Ore LIM;
 *                    `DS-C<n>_S<nn>` → Sector DS, Stockpile `DS-C_<n>` / Ore SAP.
 *
 * `_L` always means LIM and `_S` always means SAP, including for DS-C —
 * this is the confirmed correction of existing DS-C..._L... master rows
 * that were entered as SAP. Those existing wrong rows are reported
 * separately (never auto-rewritten by this function or its callers).
 *
 * For the LIM/SAP stockpile families, Sector is simply the current
 * shift's Sector (the grammar carries no sector of its own). For the
 * DS-C family, Sector is always "DS" and must equal the current shift's
 * Sector — a genuinely new DS-C pile created while a different Sector is
 * active is rejected (`PILE_ID_SECTOR_MISMATCH`), not silently coerced.
 */
export function deriveCanonicalPileArea(
  pileId: string,
  currentSectorCode: SectorCode,
): Result<DerivedPileGrammar, DomainError> {
  const dsC = DS_C_FAMILY.exec(pileId)
  if (dsC) {
    const [, n, oreLetter] = dsC
    const sectorResult = parseSectorCode('DS')
    if (!sectorResult.ok) return sectorResult
    if (currentSectorCode !== sectorResult.value) {
      return err({
        code: 'PILE_ID_SECTOR_MISMATCH',
        message: `Pile_ID ${pileId} belongs to Sector DS, but the current shift Sector is ${currentSectorCode}`,
      })
    }
    return buildDerivedPileGrammar(sectorResult.value, `DS-C_${pad(n)}`, oreLetter as 'L' | 'S')
  }

  const limStockpile = LIM_STOCKPILE_FAMILY.exec(pileId)
  if (limStockpile) {
    const [, n, sapFlag] = limStockpile
    return buildDerivedPileGrammar(currentSectorCode, `LS_${pad(n)}`, sapFlag ? 'S' : 'L')
  }

  const sapStockpile = SAP_STOCKPILE_FAMILY.exec(pileId)
  if (sapStockpile) {
    const [, n, limFlag] = sapStockpile
    return buildDerivedPileGrammar(currentSectorCode, `SS_${pad(n)}`, limFlag ? 'L' : 'S')
  }

  return err({
    code: 'PILE_ID_PATTERN_NOT_SUPPORTED',
    message: `Pile_ID ${pileId} does not match a confirmed canonical naming pattern`,
  })
}

function pad(n: string): string {
  return n.padStart(2, '0')
}

function buildDerivedPileGrammar(
  sectorCode: SectorCode,
  stockpileCodeRaw: string,
  oreLetter: 'L' | 'S',
): Result<DerivedPileGrammar, DomainError> {
  const stockpileCode = parsePileAreaCode(stockpileCodeRaw)
  if (!stockpileCode.ok) return stockpileCode
  const oreCode = parseOreCode(oreLetter === 'L' ? 'LIM' : 'SAP')
  if (!oreCode.ok) return oreCode
  return ok({ sectorCode, stockpileCode: stockpileCode.value, oreCode: oreCode.value })
}
