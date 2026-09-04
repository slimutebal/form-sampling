import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard, isClipboardCopySupported } from './clipboard'

function stubClipboard(clipboard: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  stubClipboard(undefined)
})

describe('isClipboardCopySupported', () => {
  it('is true when navigator.clipboard.writeText exists', () => {
    stubClipboard({ writeText: vi.fn() })
    expect(isClipboardCopySupported()).toBe(true)
  })

  it('is false when the Clipboard API is unavailable', () => {
    stubClipboard(undefined)
    expect(isClipboardCopySupported()).toBe(false)
  })
})

describe('copyTextToClipboard', () => {
  it('copies exactly the given text and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })

    const result = await copyTextToClipboard('hello report')

    expect(writeText).toHaveBeenCalledWith('hello report')
    expect(result.ok).toBe(true)
  })

  it('maps a rejected writeText to the stable REPORT_COPY_FAILED code, never the raw exception', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError: permission denied'))
    stubClipboard({ writeText })

    const result = await copyTextToClipboard('hello report')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_COPY_FAILED')
    expect(result.error.message).not.toContain('NotAllowedError')
  })

  it('maps an unavailable Clipboard API to REPORT_COPY_UNSUPPORTED without calling anything', async () => {
    stubClipboard(undefined)

    const result = await copyTextToClipboard('hello report')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_COPY_UNSUPPORTED')
  })
})
