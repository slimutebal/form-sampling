import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'

export interface HandoverFileReadError {
  readonly code: string
}

export interface HandoverFileReadResult {
  readonly raw: RawHandoverWorkbook
  readonly fingerprint: string
}

/**
 * The feature composition root for reading a previous-shift archive
 * File into raw workbook rows plus its fingerprint. Deliberately the
 * only place that wires the Excel integration (SheetJS,
 * `@/integrations/excel/handover-workbook-reader`) and the device
 * fingerprint utility (`@/infrastructure/device/file-fingerprint`)
 * together — both are dynamically imported so a normal field shift
 * (no handover) never loads the Excel module (TECH_STACK.md §34).
 * Domain and application code never reach this file.
 */
/**
 * Everything below is wrapped in one try/catch so this function can
 * never reject outward (rule 11 extends to rejections, not just thrown
 * `Error`s with a raw `.message`): a `File.arrayBuffer()`/`FileReader`
 * failure and a WebCrypto `crypto.subtle.digest` failure are both real
 * possibilities on field devices, and the caller (`HandoverPage`) must
 * only ever have to handle a `Result`.
 */
export async function readHandoverFile(file: File): Promise<Result<HandoverFileReadResult, HandoverFileReadError>> {
  try {
    const [{ computeFileFingerprint }, { readHandoverWorkbookFromBytes }, { readFileAsArrayBuffer }] = await Promise.all([
      import('@/infrastructure/device/file-fingerprint'),
      import('@/integrations/excel/handover-workbook-reader'),
      import('@/infrastructure/device/read-file-as-array-buffer'),
    ])

    const bytes = await readFileAsArrayBuffer(file)

    const [fingerprint, parsed] = await Promise.all([
      computeFileFingerprint(bytes),
      Promise.resolve(readHandoverWorkbookFromBytes(bytes)),
    ])

    if (!parsed.ok) {
      return parsed
    }

    return ok({ raw: parsed.value, fingerprint })
  } catch {
    return err({ code: 'FILE_READ_FAILED' })
  }
}
