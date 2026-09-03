import { describe, expect, it } from 'vitest'
import { parseOreCode } from '../common/codes'
import { parsePileId } from '../common/identifiers'
import { createPile } from './pile'

describe('Pile', () => {
  it('constructs a pile from a validated id and ore code', () => {
    const id = parsePileId('L18_S09')
    const oreCode = parseOreCode('SAP')
    expect(id.ok && oreCode.ok).toBe(true)
    if (!id.ok || !oreCode.ok) return

    const pile = createPile(id.value, oreCode.value)
    expect(pile.id).toBe(id.value)
    expect(pile.oreCode).toBe(oreCode.value)
  })

  it('does not enforce a maximum of six piles', () => {
    const oreCode = parseOreCode('LIM')
    expect(oreCode.ok).toBe(true)
    if (!oreCode.ok) return

    const piles = Array.from({ length: 12 }, (_, index) => {
      const id = parsePileId(`PILE-${String(index + 1).padStart(2, '0')}`)
      expect(id.ok).toBe(true)
      if (!id.ok) throw new Error('invalid test fixture')
      return createPile(id.value, oreCode.value)
    })

    expect(piles).toHaveLength(12)
  })
})
