import { describe, expect, it } from 'vitest'
import { buildExcaCode, displayExcaCode, normalizeExcaNumber } from './exca-code'

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

describe('Exca code normalization', () => {
  it.each([
    ['STM', '2', 'STM-Exc_0002'],
    ['STM', '23', 'STM-Exc_0023'],
    ['HS', '268', 'HS-Exc_0268'],
  ])('builds canonical %s Exca code from %s', (company, input, expected) => {
    expect(value(buildExcaCode(company, input))).toBe(expected)
  })

  it('formats the display form without the Company prefix', () => {
    expect(displayExcaCode(value(buildExcaCode('STM', '23')))).toBe('Exc_0023')
    expect(displayExcaCode(value(buildExcaCode('ABC', '1234')))).toBe('Exc_1234')
  })

  it('rejects non-numeric and longer-than-four-digit hull numbers', () => {
    expect(normalizeExcaNumber('2A').ok).toBe(false)
    expect(normalizeExcaNumber('12345').ok).toBe(false)
  })
})
