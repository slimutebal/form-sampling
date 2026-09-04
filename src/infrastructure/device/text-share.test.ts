import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTextShareSupported, shareText } from './text-share'

function stubShare(share: ((data?: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', {
    value: share,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  stubShare(undefined)
})

describe('isTextShareSupported', () => {
  it('is true when navigator.share is a function', () => {
    stubShare(vi.fn())
    expect(isTextShareSupported()).toBe(true)
  })

  it('is false when navigator.share is unavailable', () => {
    stubShare(undefined)
    expect(isTextShareSupported()).toBe(false)
  })
})

describe('shareText', () => {
  it('shares exactly the given text and reports success', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)

    const result = await shareText('hello report')

    expect(share).toHaveBeenCalledWith({ text: 'hello report' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('shared')
  })

  it('reports REPORT_SHARE_UNSUPPORTED when the Web Share API is unavailable', async () => {
    stubShare(undefined)

    const result = await shareText('hello report')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SHARE_UNSUPPORTED')
  })

  it('treats a user-cancelled AbortError as a non-error cancelled outcome', async () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError')
    stubShare(vi.fn().mockRejectedValue(abortError))

    const result = await shareText('hello report')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('cancelled')
  })

  it('maps any other rejection to the stable REPORT_SHARE_FAILED code, never the raw exception', async () => {
    stubShare(vi.fn().mockRejectedValue(new Error('some internal browser detail')))

    const result = await shareText('hello report')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('REPORT_SHARE_FAILED')
    expect(result.error.message).not.toContain('some internal browser detail')
  })
})
