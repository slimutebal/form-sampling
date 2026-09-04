import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

export interface ClipboardCopyResult {
  readonly copied: true
}

/**
 * Feature-detects the async Clipboard API (ROADMAP Phase 15 §11/§13).
 * Pure infrastructure/device concern — no dependency on any report/domain
 * type, so it stays reusable and independently testable without a real
 * mobile clipboard.
 */
export function isClipboardCopySupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
}

/**
 * Copies `text` to the system clipboard via `navigator.clipboard.writeText`.
 * Never leaks the raw browser exception outward — any failure (missing
 * API, a rejected permission prompt, etc.) collapses to the stable
 * `REPORT_COPY_UNSUPPORTED` / `REPORT_COPY_FAILED` codes so the UI can map
 * them to a localized message without ever rendering a raw
 * `Error.message`.
 */
export async function copyTextToClipboard(text: string): Promise<Result<ClipboardCopyResult, DomainError>> {
  if (!isClipboardCopySupported()) {
    return err({ code: 'REPORT_COPY_UNSUPPORTED', message: 'Clipboard API is not available in this browser.' })
  }

  try {
    await navigator.clipboard.writeText(text)
    return ok({ copied: true })
  } catch {
    return err({ code: 'REPORT_COPY_FAILED', message: 'Failed to copy the report text to the clipboard.' })
  }
}
