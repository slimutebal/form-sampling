import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import type { MasterData } from '@/domain/master/master-data'
import type { PileRegistrationDraft } from './pile-registration-draft'

/**
 * Best-effort parser for pasted operational reports. Only rows containing a
 * known Pile_ID plus positive Batch and Last Trip values become a prefill;
 * all results still enter the normal editable Sample Setup validation flow.
 */
export function parsePastedProductionSamples(
  report: string,
  masterData: MasterData,
  sectorCode: string,
): readonly PileRegistrationDraft[] {
  const candidates = masterData.pileAreas.filter((area) => area.sectorCode === sectorCode)
  const samples: PileRegistrationDraft[] = []
  for (const line of report.split(/\r?\n/)) {
    const pile = candidates.find((candidate) => line.toLowerCase().includes(String(candidate.pileId).toLowerCase()))
    const numbers = [...line.matchAll(/\d+/g)].map((match) => Number(match[0]))
    if (!pile || numbers.length < 2) continue
    const batch = parseBatchNumber(numbers[numbers.length - 2])
    const rit = parseRitNumber(numbers[numbers.length - 1])
    if (!batch.ok || !rit.ok || samples.some((sample) => sample.pileId === pile.pileId && sample.batch === batch.value)) continue
    samples.push({ pileId: pile.pileId, oreCode: pile.oreCode, batch: batch.value, rit: rit.value, status: 'ACTIVE' })
  }
  return samples
}
