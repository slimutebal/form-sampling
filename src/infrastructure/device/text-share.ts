import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

export type ShareTextOutcome =
  | { readonly kind: 'shared' }
  /** The user dismissed the native share sheet — not a failure (ROADMAP Phase 15 §12). */
  | { readonly kind: 'cancelled' }

/**
 * Feature-detects the Web Share API (`typeof navigator.share === 'function'`
 * — ROADMAP Phase 15 §12/§13). Pure infrastructure/device concern, no
 * WhatsApp SDK/API and no user-agent sniffing.
 */
export function isTextShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Shares `text` via the native Web Share API (`navigator.share({ text })`).
 * A user-cancelled share (`AbortError`) is reported as
 * `{ kind: 'cancelled' }` — an `ok` result, never an application/device
 * error — so callers never present cancellation as an operational
 * failure. Any other rejection, or the API being unavailable, collapses
 * to the stable `REPORT_SHARE_UNSUPPORTED` / `REPORT_SHARE_FAILED` codes;
 * the raw browser exception is never leaked outward.
 */
export async function shareText(text: string): Promise<Result<ShareTextOutcome, DomainError>> {
  if (!isTextShareSupported()) {
    return err({ code: 'REPORT_SHARE_UNSUPPORTED', message: 'Web Share is not available in this browser.' })
  }

  try {
    await navigator.share({ text })
    return ok({ kind: 'shared' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return ok({ kind: 'cancelled' })
    }
    return err({ code: 'REPORT_SHARE_FAILED', message: 'Failed to share the report text.' })
  }
}
