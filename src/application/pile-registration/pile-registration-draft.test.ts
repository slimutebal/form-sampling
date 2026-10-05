import { describe, expect, it } from 'vitest'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode } from '@/domain/common/codes'
import { parsePileId } from '@/domain/common/identifiers'
import {
  activeRegistrationPileIds,
  deriveActiveRegistrationPiles,
  type PileRegistrationDraft,
} from './pile-registration-draft'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function registration(batch: number, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): PileRegistrationDraft {
  return {
    pileId: must(parsePileId('S5_24')),
    oreCode: must(parseOreCode('SAP')),
    batch: must(parseBatchNumber(batch)),
    rit: must(parseRitNumber(batch)),
    status,
  }
}

describe('PileRegistrationDraft projections', () => {
  it('keeps repeated active Batch rows distinct in the draft while projecting one Fleet/workspace Pile identity', () => {
    const registrations = [registration(2), registration(6), registration(8)]

    expect(registrations).toHaveLength(3)
    expect(deriveActiveRegistrationPiles(registrations)).toEqual([{ id: 'S5_24', oreCode: 'SAP' }])
    expect(activeRegistrationPileIds(registrations)).toEqual(['S5_24'])
  })

  it('excludes inactive-only registrations from the Fleet/workspace projection without removing their history rows', () => {
    const registrations = [registration(5, 'INACTIVE')]

    expect(registrations).toHaveLength(1)
    expect(deriveActiveRegistrationPiles(registrations)).toEqual([])
    expect(activeRegistrationPileIds(registrations)).toEqual([])
  })
})
