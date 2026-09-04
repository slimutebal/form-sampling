import { describe, expect, it } from 'vitest'
import portSource from './haulage-transaction-store.ts?raw'

describe('haulage-transaction-store port', () => {
  it('A. the port source file never imports from infrastructure', () => {
    // Mirrors the architecture guard exactly: matches an actual import
    // reference to infrastructure, not the word "infrastructure" turning
    // up in prose/comments (which this file's own docs legitimately do).
    expect(portSource).not.toMatch(/@\/infrastructure|from ['"][^'"]*infrastructure/)
  })
})
