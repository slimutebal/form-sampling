import { describe, expect, it } from 'vitest'
import { parseSectorCode } from '../common/codes'
import { parseFrontId } from '../common/identifiers'
import { parseHaulerCode } from '../master/master-codes'
import { createFrontDefinition } from './front'

describe('FrontDefinition', () => {
  it('represents a Front with its Sector and Hauler as distinct branded values', () => {
    const frontId = parseFrontId('F1')
    const sectorCode = parseSectorCode('S1')
    const haulerCode = parseHaulerCode('H1')
    expect(frontId.ok && sectorCode.ok && haulerCode.ok).toBe(true)
    if (!frontId.ok || !sectorCode.ok || !haulerCode.ok) return

    const front = createFrontDefinition(frontId.value, sectorCode.value, haulerCode.value)

    expect(front.frontId).toBe('F1')
    expect(front.sectorCode).toBe('S1')
    expect(front.haulerCode).toBe('H1')
  })

  it('does not compute or store a legacy Sector/FrontNumber display label', () => {
    const frontId = parseFrontId('F1')
    const sectorCode = parseSectorCode('S1')
    const haulerCode = parseHaulerCode('H1')
    expect(frontId.ok && sectorCode.ok && haulerCode.ok).toBe(true)
    if (!frontId.ok || !sectorCode.ok || !haulerCode.ok) return

    const front = createFrontDefinition(frontId.value, sectorCode.value, haulerCode.value)

    expect(Object.keys(front).sort()).toEqual(['frontId', 'haulerCode', 'sectorCode'])
  })
})
