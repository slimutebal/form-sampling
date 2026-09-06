import { describe, expect, it } from 'vitest'
import { parseSectorCode } from '../common/codes'
import { parseFrontId, parsePileId } from '../common/identifiers'
import { parseHaulerCode } from '../master/master-codes'
import { createFrontDefinition, createFrontId, nextFrontNumber } from './front'

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
    expect(front.destinationPileId).toBeUndefined()
  })

  it('does not compute or store a legacy Sector/FrontNumber display label', () => {
    const frontId = parseFrontId('F1')
    const sectorCode = parseSectorCode('S1')
    const haulerCode = parseHaulerCode('H1')
    expect(frontId.ok && sectorCode.ok && haulerCode.ok).toBe(true)
    if (!frontId.ok || !sectorCode.ok || !haulerCode.ok) return

    const front = createFrontDefinition(frontId.value, sectorCode.value, haulerCode.value)

    expect(Object.keys(front).sort()).toEqual(['destinationPileId', 'frontId', 'haulerCode', 'sectorCode'])
  })

  it('carries an optional Destination/Pile (Phase 18 §5) when given one', () => {
    const frontId = parseFrontId('F1')
    const sectorCode = parseSectorCode('S1')
    const haulerCode = parseHaulerCode('H1')
    const destinationPileId = parsePileId('PILE-1')
    expect(frontId.ok && sectorCode.ok && haulerCode.ok && destinationPileId.ok).toBe(true)
    if (!frontId.ok || !sectorCode.ok || !haulerCode.ok || !destinationPileId.ok) return

    const front = createFrontDefinition(frontId.value, sectorCode.value, haulerCode.value, destinationPileId.value)

    expect(front.destinationPileId).toBe('PILE-1')
  })
})

describe('createFrontId', () => {
  it('derives Sector + two-digit Front Number (BR-FLEET-001)', () => {
    const sectorCode = parseSectorCode('BR1')
    expect(sectorCode.ok).toBe(true)
    if (!sectorCode.ok) return

    expect(createFrontId(sectorCode.value, 1)).toMatchObject({ ok: true, value: 'BR1/01' })
    expect(createFrontId(sectorCode.value, 25)).toMatchObject({ ok: true, value: 'BR1/25' })
  })

  it('rejects a Front Number outside 1–25', () => {
    const sectorCode = parseSectorCode('BR1')
    expect(sectorCode.ok).toBe(true)
    if (!sectorCode.ok) return

    expect(createFrontId(sectorCode.value, 0)).toMatchObject({
      ok: false,
      error: { code: 'FRONT_NUMBER_OUT_OF_RANGE' },
    })
    expect(createFrontId(sectorCode.value, 26)).toMatchObject({
      ok: false,
      error: { code: 'FRONT_NUMBER_OUT_OF_RANGE' },
    })
    expect(createFrontId(sectorCode.value, 1.5)).toMatchObject({
      ok: false,
      error: { code: 'FRONT_NUMBER_OUT_OF_RANGE' },
    })
  })
})

describe('nextFrontNumber', () => {
  it('returns 1 when no Fronts exist yet for this Sector', () => {
    expect(nextFrontNumber([])).toMatchObject({ ok: true, value: 1 })
  })

  it('returns existing MAX + 1, not the first available gap', () => {
    expect(nextFrontNumber([1, 2, 3, 4, 6])).toMatchObject({ ok: true, value: 7 })
  })

  it('rejects once the maximum of 25 is already in use', () => {
    expect(nextFrontNumber([1, 25])).toMatchObject({
      ok: false,
      error: { code: 'FRONT_NUMBER_LIMIT_REACHED' },
    })
  })
})
