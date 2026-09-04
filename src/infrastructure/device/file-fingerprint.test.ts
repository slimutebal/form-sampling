import { describe, expect, it } from 'vitest'
import { computeFileFingerprint } from './file-fingerprint'

describe('computeFileFingerprint', () => {
  it('produces a stable SHA-256 hex digest for the same bytes', async () => {
    const bytes = new TextEncoder().encode('same content').buffer
    const first = await computeFileFingerprint(bytes as ArrayBuffer)
    const second = await computeFileFingerprint(bytes as ArrayBuffer)
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different fingerprints for different bytes', async () => {
    const a = await computeFileFingerprint(new TextEncoder().encode('content A').buffer as ArrayBuffer)
    const b = await computeFileFingerprint(new TextEncoder().encode('content B').buffer as ArrayBuffer)
    expect(a).not.toBe(b)
  })
})
