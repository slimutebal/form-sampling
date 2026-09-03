import { describe, expect, it } from 'vitest'
import portSource from './shift-workspace-reader.ts?raw'

describe('shift-workspace-reader port', () => {
  it('A. the port source file never imports from infrastructure', () => {
    // Mirrors the architecture guard exactly: matches an actual import
    // reference to infrastructure, not the word "infrastructure" turning
    // up in prose/comments (which this file's own docs legitimately do).
    expect(portSource).not.toMatch(/@\/infrastructure|from ['"][^'"]*infrastructure/)
  })
})
